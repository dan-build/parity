/**
 * Typed CoinMarketCap client. Server-side only.
 *
 * - One function per endpoint. Types cover only fields seen in `fixtures/`.
 * - Every call (cached or not) is logged to `client.evidence` for the Evidence drawer.
 * - 2xx responses are cached for 60s at module level, shared across clients.
 * - Endpoint functions never throw: they return `{ ok: false, ... }` instead.
 * - The transport is pluggable: live HTTP here, recording/fixture replay in cmc-fixtures.ts.
 */

export const CMC_BASE = "https://pro-api.coinmarketcap.com";
export const CACHE_TTL_MS = 60_000;

/** The DEX API names some chains differently from CMC's platform slug (bnb → 500, bsc → 200). */
export const DEX_PLATFORM_ALIASES: Record<string, string> = { bnb: "bsc" };
/** Chains whose DEX pool lookups we've verified. Others are skipped and reported as a gap. */
export const SUPPORTED_DEX_CHAINS = ["ethereum", "solana", "bsc"] as const;

// --- transport ---------------------------------------------------------------

export type Params = Record<string, string | number>;
export type CmcRequest = { path: string; params: Params };
export type CmcResponse = { status: number; body: unknown };
export type Transport = (req: CmcRequest) => Promise<CmcResponse>;

/** Canonical key for a request: path + params sorted by name. Used for cache and fixtures. */
export function requestKey({ path, params }: CmcRequest): string {
  const qs = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return qs ? `${path}?${qs}` : path;
}

export function liveTransport(apiKey: string): Transport {
  return async ({ path, params }) => {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    const res = await fetch(`${CMC_BASE}${path}${qs.size ? `?${qs}` : ""}`, {
      headers: { "X-CMC_PRO_API_KEY": apiKey, Accept: "application/json" },
      cache: "no-store",
    });
    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = { _non_json_body: text.slice(0, 2000) };
    }
    return { status: res.status, body };
  };
}

// --- response types (only fields observed in fixtures) ------------------------

export type AssetType = "stock" | "commodity" | "currency" | "government_security" | "etf" | "real_estate";

export type RwaMapEntry = {
  rwa_id: number;
  name: string;
  symbol: string;
  slug: string;
  asset_type: AssetType;
  rwa_rank: number | null;
  has_tokens: boolean;
};

export type RwaToken = {
  crypto_id: number;
  symbol: string;
  name: string;
  issuer_id: string | null;
  issuer_name: string | null;
  price: number | null;
  market_cap: number | null;
  volume_24h: number | null;
};

export type TradfiMarket = {
  exchange: { exchange_id: number; name: string; slug: string };
  ticker: string;
  market_url: string | null;
};

export type RwaQuote = {
  rwa_id: number;
  name: string;
  symbol: string;
  slug: string;
  asset_type: AssetType;
  rwa_rank: number | null;
  has_tokens: boolean;
  average_tokenized_price: number | null;
  tokenized_market_cap: number | null;
  tokenized_volume_24h: number | null;
  last_updated: string | null;
  tokens: RwaToken[];
  tradfi_markets: TradfiMarket[];
};

/** Primary contract for a wrapper, from /v2/cryptocurrency/info `platform`. */
export type WrapperContract = {
  crypto_id: number;
  platform_slug: string;
  platform_name: string;
  address: string;
};

export type DexPool = {
  address: string;
  exchange: string | null;
  /** null when CMC omits `liqUsd` (common on tokenised-stock pools). Never 0 by default. */
  liquidity_usd: number | null;
  volume_24h_usd: number | null;
  pair: string;
};

// --- evidence ------------------------------------------------------------------

export type EvidenceEntry = {
  endpoint: string;
  params: Params;
  status: number | null;
  error_code: string | null;
  credit_count: number | null;
  fetched_at: string;
  elapsed_ms: number;
  cached: boolean;
  source: "live" | "fixture";
  excerpt: unknown;
};

export type CmcResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number | null; errorCode: string | null; message: string };

/** Trim a response for display: depth ≤ 4, arrays ≤ 3 items, strings ≤ 200 chars. */
export function trimForEvidence(v: unknown, depth = 0): unknown {
  if (typeof v === "string") return v.length > 200 ? `${v.slice(0, 200)}…` : v;
  if (v === null || typeof v !== "object") return v;
  if (depth >= 4) return Array.isArray(v) ? `[${v.length} items]` : "{…}";
  if (Array.isArray(v)) {
    const out = v.slice(0, 3).map((x) => trimForEvidence(x, depth + 1));
    if (v.length > 3) out.push(`… ${v.length - 3} more`);
    return out;
  }
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trimForEvidence(x, depth + 1)]));
}

// --- helpers for reading unknown JSON -------------------------------------------

function get(obj: unknown, ...path: (string | number)[]): unknown {
  let cur = obj;
  for (const k of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[k];
  }
  return cur;
}

/** Parse numbers that may arrive as long decimal strings. Missing/invalid → null. */
export function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// --- client -----------------------------------------------------------------------

const cache = new Map<string, { at: number; res: CmcResponse }>();

/** Test helper: clear the module-level cache. */
export function clearCmcCache() {
  cache.clear();
}

export type CmcClient = ReturnType<typeof createCmcClient>;

export function createCmcClient(opts: { transport: Transport; source?: "live" | "fixture"; now?: () => number }) {
  const { transport, source = "live", now = Date.now } = opts;
  const evidence: EvidenceEntry[] = [];

  async function request(path: string, params: Params = {}): Promise<CmcResult<unknown>> {
    const req = { path, params };
    const key = requestKey(req);
    const started = now();
    const hit = cache.get(key);
    let res: CmcResponse | null = null;
    let cached = false;
    let message = "";

    if (hit && started - hit.at < CACHE_TTL_MS) {
      res = hit.res;
      cached = true;
    } else {
      try {
        res = await transport(req);
        if (res.status >= 200 && res.status < 300) cache.set(key, { at: started, res });
      } catch (err) {
        message = `Network error: ${(err as Error).message}`;
      }
    }

    const errorCode = res ? (get(res.body, "status", "error_code") as string | undefined) ?? null : null;
    evidence.push({
      endpoint: path,
      params,
      status: res?.status ?? null,
      error_code: errorCode === "0" ? null : errorCode,
      credit_count: num(get(res?.body, "status", "credit_count")),
      fetched_at: new Date(started).toISOString(),
      elapsed_ms: now() - started,
      cached,
      source,
      excerpt: trimForEvidence(res?.body ?? null),
    });

    if (!res) return { ok: false, status: null, errorCode: null, message };
    if (res.status < 200 || res.status >= 300) {
      const msg = get(res.body, "status", "error_message");
      return {
        ok: false,
        status: res.status,
        errorCode,
        message: typeof msg === "string" && msg ? msg : `HTTP ${res.status}`,
      };
    }
    return { ok: true, data: res.body };
  }

  function map<T>(r: CmcResult<unknown>, fn: (body: unknown) => T): CmcResult<T> {
    return r.ok ? { ok: true, data: fn(r.data) } : r;
  }

  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

  return {
    evidence,

    /** Generic call for endpoints without a typed wrapper (key info, F&G, liquidations…). */
    get: request,

    /** GET /v5/real-world-assets/map (0 credits). Full list, used to resolve queries. */
    async rwaMap(): Promise<CmcResult<RwaMapEntry[]>> {
      return map(await request("/v5/real-world-assets/map"), (b) => arr(get(b, "data", "rwa_assets")) as RwaMapEntry[]);
    },

    /** GET /v5/real-world-assets/quotes/latest for one asset. */
    async rwaQuotesLatest(rwaId: number): Promise<CmcResult<RwaQuote | null>> {
      return map(await request("/v5/real-world-assets/quotes/latest", { rwa_id: rwaId }), (b) => {
        const row = arr(get(b, "data", "rwa_assets")).find((r) => get(r, "rwa_id") === rwaId);
        if (!row) return null;
        const q = row as RwaQuote;
        return { ...q, tokens: arr(q.tokens) as RwaToken[], tradfi_markets: arr(q.tradfi_markets) as TradfiMarket[] };
      });
    },

    /** GET /v2/cryptocurrency/info → primary contract per wrapper, keyed by crypto_id. */
    async cryptoInfo(cryptoIds: number[]): Promise<CmcResult<Map<number, WrapperContract>>> {
      const ids = [...new Set(cryptoIds)].sort((a, b) => a - b);
      return map(await request("/v2/cryptocurrency/info", { id: ids.join(",") }), (b) => {
        const out = new Map<number, WrapperContract>();
        for (const id of ids) {
          const p = get(b, "data", String(id), "platform");
          const slug = get(p, "slug");
          const address = get(p, "token_address");
          if (typeof slug === "string" && typeof address === "string" && address) {
            out.set(id, { crypto_id: id, platform_slug: slug, platform_name: String(get(p, "name") ?? slug), address });
          }
        }
        return out;
      });
    },

    /** GET /v1/dex/token/pools. `platform` is a CMC platform slug; aliases are applied here. */
    async dexTokenPools(platform: string, address: string): Promise<CmcResult<DexPool[]>> {
      const chain = dexChain(platform);
      return map(await request("/v1/dex/token/pools", { platform: chain, address, size: 10 }), (b) =>
        arr(get(b, "data")).map((p) => ({
          address: String(get(p, "addr") ?? ""),
          exchange: (get(p, "exn") as string | undefined) ?? null,
          liquidity_usd: num(get(p, "liqUsd")),
          volume_24h_usd: num(get(p, "v24")),
          pair: `${get(p, "t0", "sym") ?? "?"}/${get(p, "t1", "sym") ?? "?"}`,
        })),
      );
    },
  };
}

/** CMC platform slug → DEX API platform name. */
export function dexChain(platformSlug: string): string {
  const s = platformSlug.toLowerCase();
  return DEX_PLATFORM_ALIASES[s] ?? s;
}

export function isSupportedDexChain(platformSlug: string): boolean {
  return (SUPPORTED_DEX_CHAINS as readonly string[]).includes(dexChain(platformSlug));
}
