/**
 * Orchestration for GET /api/check: resolve the query, fetch what the engine
 * needs through the CMC client, then hand plain data to the pure verdict().
 */
import {
  isSupportedDexChain,
  type AssetType,
  type MetalCode,
  type CmcClient,
  type EvidenceEntry,
  type RwaMapEntry,
  type WrapperContract,
} from "./cmc";
import { loadRegistry, type RedemptionRoute } from "./registry";
import { METHOD_VERSION, preScreen, verdict, type Spot, type TokenUnit, type Gap, type PoolLookup, type VerdictInput, type VerdictResult } from "./verdict";

export type CheckResult = VerdictResult & {
  query: string;
  asset: { rwa_id: number; name: string; symbol: string; slug: string; asset_type: AssetType };
  evidence: EvidenceEntry[];
  /** When CMC last updated these quotes (ISO), from quotes/latest `last_updated`. */
  data_as_of: string | null;
  generated_at: string;
  /** METHOD.md version that produced this verdict. */
  method_version: string;
  /** The registry file used for units, if any (registry/<SYMBOL>.json). */
  registry: { file: string; tokens: number; units: number } | null;
  /** How a holder can get the real asset, per token, from the registry (issuers' own pages). Informational: no verdict uses it. */
  redemption: RedemptionFact[];
};

export type RedemptionFact = { crypto_id: number; route: RedemptionRoute; summary: string; url: string };

export type CheckOutcome =
  | { kind: "ok"; result: CheckResult }
  | { kind: "not_found"; query: string; suggestions: { symbol: string; name: string }[]; evidence: EvidenceEntry[] }
  | { kind: "error"; query: string; message: string; evidence: EvidenceEntry[] };

/** Match symbol, then slug, then name (case-insensitive). Collisions: has_tokens first, then best rank. */
export function resolveQuery(q: string, entries: RwaMapEntry[]): { match: RwaMapEntry | null; others: RwaMapEntry[] } {
  const n = q.trim().toLowerCase();
  const byRank = (a: RwaMapEntry, b: RwaMapEntry) =>
    Number(b.has_tokens) - Number(a.has_tokens) || (a.rwa_rank ?? Infinity) - (b.rwa_rank ?? Infinity);
  for (const field of ["symbol", "slug", "name"] as const) {
    const hits = entries.filter((e) => String(e[field] ?? "").toLowerCase() === n).sort(byRank);
    if (hits.length) return { match: hits[0], others: hits.slice(1) };
  }
  return { match: null, others: [] };
}

/** Edit distance, capped: returns early once it's past `max` (only "one typo away" matters here). */
function withinEdits(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (Math.min(...cur) > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

/**
 * Close matches for a query that found nothing: a ticker, slug or name that contains it, a
 * ticker it contains ("GOLDD" → GOLD), or a ticker one typo away ("NVDIA" → NVDA).
 */
export function suggest(q: string, entries: RwaMapEntry[], limit = 5): { symbol: string; name: string }[] {
  const n = q.trim().toLowerCase();
  if (!n) return [];
  const close = (e: RwaMapEntry) => {
    const sym = String(e.symbol ?? "").toLowerCase();
    return (
      [e.symbol, e.slug, e.name].some((f) => String(f ?? "").toLowerCase().includes(n)) ||
      (sym.length >= 3 && n.includes(sym)) ||
      (n.length >= 3 && withinEdits(n, sym, 1))
    );
  };
  return entries
    .filter((e) => e.has_tokens && close(e))
    .sort((a, b) => (a.rwa_rank ?? Infinity) - (b.rwa_rank ?? Infinity))
    .slice(0, limit)
    .map((e) => ({ symbol: e.symbol, name: e.name }));
}

export async function check(q: string, client: CmcClient): Promise<CheckOutcome> {
  const query = q.trim();
  const extraGaps: Gap[] = [];

  // 1. Resolve query → rwa_id. Tickers resolve with one free call; names/slugs need the full map.
  let resolved: ReturnType<typeof resolveQuery> = { match: null, others: [] };
  if (/^[A-Za-z0-9.]{1,12}$/.test(query)) {
    const bySymbol = await client.rwaMapBySymbol(query);
    if (bySymbol.ok) resolved = resolveQuery(query, bySymbol.data.filter((e) => e.symbol.toLowerCase() === query.toLowerCase()));
  }
  if (!resolved.match) {
    const mapRes = await client.rwaMap();
    if (!mapRes.ok) {
      return { kind: "error", query, message: `Couldn't load the asset list: ${mapRes.message}`, evidence: client.evidence };
    }
    resolved = resolveQuery(query, mapRes.data);
    if (!resolved.match) return { kind: "not_found", query, suggestions: suggest(query, mapRes.data), evidence: client.evidence };
  }
  const { match, others } = resolved as { match: RwaMapEntry; others: RwaMapEntry[] };
  if (others.length) {
    extraGaps.push({
      code: "ambiguous_query",
      message: `“${query}” also matches ${others.map((o) => `${o.name} (${o.asset_type})`).join(", ")}. We picked ${match.name}.`,
    });
  }

  // 2–4. Wrappers, contracts, pools.
  const gathered = await gatherInputs(match.rwa_id, client);
  if (!gathered.ok) {
    return { kind: "error", query, message: `Couldn't load prices for ${match.name}: ${gathered.message}`, evidence: client.evidence };
  }
  const { input, slug, gaps, dataAsOf, registry, redemption } = gathered;

  // 5. Pure verdict.
  const v = verdict(input);

  return {
    kind: "ok",
    result: {
      ...v,
      gaps: [...v.gaps, ...gaps, ...extraGaps],
      query,
      asset: { rwa_id: input.asset.rwa_id, name: input.asset.name, symbol: input.asset.symbol, slug, asset_type: input.asset.asset_type },
      evidence: client.evidence,
      data_as_of: dataAsOf,
      generated_at: new Date().toISOString(),
      method_version: METHOD_VERSION,
      registry,
      redemption: redemption.filter((f) => v.wrappers.some((w) => w.crypto_id === f.crypto_id)),
    },
  };
}

/** A metal's latest spot is used instead of the quotes' moment only within this many minutes (METHOD.md §5). */
export const SPOT_MAX_GAP_MIN = 15;

/** RWA commodity symbol → the metal CMC prices as spot (/v1/fiat/map?include_metals=true). */
const METAL_FOR: Record<string, MetalCode> = { GOLD: "XAU", SILVER: "XAG", PLATINUM: "XPT", PALLADIUM: "XPD" };

/** The metal CMC prices as spot for this RWA asset, if any. */
export const metalFor = (a: { asset_type: AssetType; symbol: string }): MetalCode | undefined =>
  a.asset_type === "commodity" ? METAL_FOR[a.symbol.toUpperCase()] : undefined;

/**
 * Fetch everything verdict() needs for one rwa_id: wrappers (quotes/latest),
 * their primary contracts, and DEX pools for live wrappers on verified chains.
 */
export async function gatherInputs(
  rwaId: number,
  client: CmcClient,
): Promise<
  | { ok: true; input: VerdictInput; slug: string; dataAsOf: string | null; gaps: Gap[]; registry: CheckResult["registry"]; redemption: RedemptionFact[] }
  | { ok: false; message: string }
> {
  const gaps: Gap[] = [];
  const quoteRes = await client.rwaQuotesLatest(rwaId);
  if (!quoteRes.ok) return { ok: false, message: quoteRes.message };
  if (!quoteRes.data) return { ok: false, message: "no data returned" };
  const quote = quoteRes.data;
  const tokens = quote.tokens.filter((t) => typeof t.crypto_id === "number");

  // Metals: CMC's spot price at the moment of these quotes, so the comparison is like-for-like.
  // CMC sometimes answers that call with no price and no error (FRICTION.md #14); then the
  // latest spot is used, but only if it's from within SPOT_MAX_GAP_MIN of the quotes.
  let spot: Spot | null = null;
  const metal = metalFor(quote);
  if (metal) {
    let s = await client.metalSpot(metal, quote.last_updated);
    if (!s.ok && s.status === 200 && quote.last_updated) {
      const latest = await client.metalSpot(metal, null);
      const gapMin = latest.ok && latest.data.as_of ? Math.abs(Date.parse(latest.data.as_of) - Date.parse(quote.last_updated)) / 60_000 : Infinity;
      if (latest.ok && gapMin <= SPOT_MAX_GAP_MIN) {
        s = latest;
        gaps.push({ code: "spot_latest", message: `CoinMarketCap had no ${quote.name.toLowerCase()} spot price for the exact time of these quotes, so the latest one is used (${Math.round(gapMin)} min apart).` });
      } else if (latest.ok) s = { ok: false, status: 200, errorCode: null, message: `none for the time of these quotes, and the latest is ${Math.round(gapMin)} min away` };
    }
    if (s.ok) spot = { code: metal, ...s.data };
    else gaps.push({ code: "spot_unavailable", message: `Couldn't get the ${quote.name.toLowerCase()} spot price (${s.message}), so tokens are compared with each other instead.` });
  }

  // Units from the open registry, where someone has recorded them.
  const reg = loadRegistry(quote.symbol, quote.rwa_id);
  const units = new Map<number, TokenUnit>();
  for (const t of reg?.tokens ?? []) if (t.unit) units.set(t.crypto_id, t.unit);
  const registry = reg ? { file: `registry/${quote.symbol.toUpperCase()}.json`, tokens: reg.tokens.length, units: units.size } : null;
  const redemption: RedemptionFact[] = (reg?.tokens ?? []).flatMap((t) => (t.redemption ? [{ crypto_id: t.crypto_id, route: t.redemption.route, summary: t.redemption.summary, url: t.redemption.url }] : []));

  // Contracts (chain + address) per wrapper.
  let contracts = new Map<number, WrapperContract>();
  if (tokens.length) {
    const infoRes = await client.cryptoInfo(tokens.map((t) => t.crypto_id));
    if (infoRes.ok) contracts = infoRes.data;
    else gaps.push({ code: "contracts_unavailable", message: `Couldn't look up token contracts (${infoRes.message}), so DEX pools weren't checked.` });
  }

  // DEX pools for live wrappers on chains we've verified.
  const pools = new Map<number, PoolLookup>();
  await Promise.all(
    tokens.map(async (t) => {
      if (preScreen(t)) return; // GHOST already; don't spend credits
      const c = contracts.get(t.crypto_id);
      if (!c) return pools.set(t.crypto_id, { checked: false, reason: "no contract address" });
      if (!isSupportedDexChain(c.platform_slug)) {
        return pools.set(t.crypto_id, { checked: false, reason: `${c.platform_name} isn't supported yet` });
      }
      const r = await client.dexTokenPools(c.platform_slug, c.address);
      pools.set(t.crypto_id, r.ok ? { checked: true, pools: r.data } : { checked: false, reason: `CMC error: ${r.message}` });
    }),
  );

  return {
    ok: true,
    slug: quote.slug,
    dataAsOf: quote.last_updated,
    gaps,
    input: {
      asset: {
        rwa_id: quote.rwa_id,
        name: quote.name,
        symbol: quote.symbol,
        asset_type: quote.asset_type,
        average_tokenized_price: quote.average_tokenized_price,
        tradfi_markets: quote.tradfi_markets,
      },
      tokens,
      contracts,
      pools,
      spot,
      units,
    },
    registry,
    redemption,
  };
}
