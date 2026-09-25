/**
 * CMC endpoint probe. Hits every endpoint PARITY might use with GOLD and NVDA,
 * logs HTTP status + credits per call, and saves each raw response body to
 * fixtures/<name>.json. Writes fixtures/_probe-summary.json at the end.
 *
 * Run: npm run probe   (reads CMC_API_KEY from .env.local)
 *
 * The API key is only ever sent as a request header. It is never logged or saved.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://pro-api.coinmarketcap.com";
const FIXTURES = join(process.cwd(), "fixtures");
const DELAY_MS = 2100; // stay well under per-minute rate limits
const ASSETS = [
  { symbol: "GOLD", preferType: "commodity" },
  { symbol: "NVDA", preferType: "stock" },
];
const MAX_WRAPPERS_PER_ASSET = 3;
// The DEX API names some chains differently from CMC's platform coin slug.
// Confirmed by probing: platform=bnb → 500 "system is busy", platform=bsc → 200.
const DEX_PLATFORM_ALIASES: Record<string, string> = { bnb: "bsc" };

const KEY = process.env.CMC_API_KEY;
if (!KEY) {
  console.error("CMC_API_KEY missing. Put it in .env.local and run `npm run probe`.");
  process.exit(1);
}

type Params = Record<string, string | number>;
type Result = {
  name: string;
  path: string;
  params: Params;
  http_status: number | null;
  error_code: unknown;
  error_message: unknown;
  credit_count: unknown;
  elapsed_ms: number;
  fetched_at: string;
  fixture: string | null;
  note?: string;
};

const results: Result[] = [];

// --- tiny helpers for reading unknown JSON without inventing types ----------
function get(obj: unknown, ...path: (string | number)[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[k];
  }
  return cur;
}
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined;
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const safeName = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, "_");

// --- the one call helper -----------------------------------------------------
async function call(name: string, path: string, params: Params = {}): Promise<{ status: number | null; body: unknown }> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const url = `${BASE}${path}${qs.size ? `?${qs}` : ""}`;
  const fetched_at = new Date().toISOString();
  const t0 = Date.now();
  let status: number | null = null;
  let body: unknown = null;
  let fixture: string | null = null;
  let note: string | undefined;

  try {
    const res = await fetch(url, { headers: { "X-CMC_PRO_API_KEY": KEY!, Accept: "application/json" } });
    status = res.status;
    const text = await res.text();
    const file = `${safeName(name)}.json`;
    try {
      body = JSON.parse(text);
      writeFileSync(join(FIXTURES, file), JSON.stringify(body, null, 2) + "\n");
    } catch {
      body = text;
      writeFileSync(join(FIXTURES, file), JSON.stringify({ _non_json_body: text }, null, 2) + "\n");
      note = "non-JSON body";
    }
    fixture = `fixtures/${file}`;
  } catch (err) {
    note = `network error: ${(err as Error).message}`;
  }

  const r: Result = {
    name,
    path,
    params,
    http_status: status,
    error_code: get(body, "status", "error_code") ?? get(body, "status", "errorCode") ?? get(body, "code"),
    error_message: get(body, "status", "error_message") ?? get(body, "status", "errorMessage") ?? get(body, "message"),
    credit_count: get(body, "status", "credit_count") ?? get(body, "status", "creditCount"),
    elapsed_ms: Date.now() - t0,
    fetched_at,
    fixture,
    note,
  };
  results.push(r);
  const ok = status !== null && status >= 200 && status < 300;
  console.log(
    `${ok ? "OK  " : "FAIL"} ${String(status ?? "---").padEnd(4)} credits=${String(r.credit_count ?? "?").padEnd(3)} ${name}` +
      (ok ? "" : `  → ${String(r.error_message ?? note ?? "")}`),
  );
  await sleep(DELAY_MS);
  return { status, body };
}

function skip(name: string, path: string, reason: string) {
  results.push({
    name, path, params: {}, http_status: null, error_code: null, error_message: null,
    credit_count: null, elapsed_ms: 0, fetched_at: new Date().toISOString(), fixture: null,
    note: `skipped: ${reason}`,
  });
  console.log(`SKIP ---- ${name}  → ${reason}`);
}

const ok = (s: number | null) => s !== null && s >= 200 && s < 300;

// --- probe -------------------------------------------------------------------
async function main() {
  mkdirSync(FIXTURES, { recursive: true });
  const symbols = ASSETS.map((a) => a.symbol).join(",");
  const tag = ASSETS.map((a) => a.symbol).join("_");

  // 1. key info (start)
  const keyStart = await call("key-info.start", "/v1/key/info");

  // 2. map → rwa_ids (log every match so symbol collisions are visible)
  const map = await call(`rwa-map.${tag}`, "/v5/real-world-assets/map", { symbol: symbols });
  const mapRows = arr(get(map.body, "data", "rwa_assets"));
  const rwaIds: Record<string, string> = {};
  for (const a of ASSETS) {
    const matches = mapRows.filter((r) => str(get(r, "symbol"))?.toUpperCase() === a.symbol);
    for (const m of matches) {
      console.log(`     map ${a.symbol}: rwa_id=${str(get(m, "rwa_id"))} type=${str(get(m, "asset_type"))} name=${str(get(m, "name"))}`);
    }
    const pick = matches.find((m) => get(m, "asset_type") === a.preferType) ?? matches[0];
    const id = str(get(pick, "rwa_id"));
    if (id) rwaIds[a.symbol] = id;
  }
  const idList = Object.values(rwaIds).join(",");

  // 3–5. info / quotes / assets list for both assets
  let quotesBody: unknown = null;
  if (idList) {
    await call(`rwa-info.${tag}`, "/v5/real-world-assets/info", { rwa_id: idList });
    quotesBody = (await call(`rwa-quotes-latest.${tag}`, "/v5/real-world-assets/quotes/latest", { rwa_id: idList })).body;
    await call(`rwa-assets-list.${tag}`, "/v5/real-world-assets/assets/list", { rwa_id: idList });
  } else {
    for (const p of ["info", "quotes/latest", "assets/list"]) skip(`rwa-${p}`, `/v5/real-world-assets/${p}`, "no rwa_id from map");
  }

  // 6. market pairs per asset
  for (const a of ASSETS) {
    const id = rwaIds[a.symbol];
    if (id) await call(`rwa-market-pairs.${a.symbol}`, "/v5/real-world-assets/market-pairs/list", { rwa_id: id, limit: 50 });
    else skip(`rwa-market-pairs.${a.symbol}`, "/v5/real-world-assets/market-pairs/list", "no rwa_id");
  }

  // 7–8. issuers
  const issuersList = await call("rwa-issuers-list", "/v5/real-world-assets/issuers/list", { limit: 100 });
  const quoteRows = arr(get(quotesBody, "data", "rwa_assets"));
  const issuerId =
    quoteRows.flatMap((q) => arr(get(q, "tokens"))).map((t) => str(get(t, "issuer_id"))).find(Boolean) ??
    str(get(arr(get(issuersList.body, "data", "issuers"))[0], "issuer_id")) ??
    str(get(arr(get(issuersList.body, "data"))[0], "issuer_id"));
  if (issuerId) await call(`rwa-issuer.${issuerId}`, "/v5/real-world-assets/issuers", { issuer_id: issuerId });
  else skip("rwa-issuer", "/v5/real-world-assets/issuers", "no issuer_id found in quotes or issuers list");

  // 9. wrapper crypto_ids → contract addresses
  type Wrapper = { asset: string; crypto_id: string; symbol: string };
  const wrappers: Wrapper[] = [];
  for (const q of quoteRows) {
    const asset = str(get(q, "symbol")) ?? "?";
    const tokens = arr(get(q, "tokens"))
      .slice()
      .sort((x, y) => num(get(y, "market_cap")) - num(get(x, "market_cap")))
      .slice(0, MAX_WRAPPERS_PER_ASSET);
    for (const t of tokens) {
      const id = str(get(t, "crypto_id"));
      if (id) wrappers.push({ asset, crypto_id: id, symbol: str(get(t, "symbol")) ?? id });
    }
  }

  type Contract = { wrapper: Wrapper; address: string; platformSlug?: string; platformName?: string };
  const contracts: Contract[] = [];
  if (wrappers.length) {
    const info = await call(`crypto-info.wrappers`, "/v2/cryptocurrency/info", { id: wrappers.map((w) => w.crypto_id).join(",") });
    for (const w of wrappers) {
      const entry = get(info.body, "data", w.crypto_id);
      const list = arr(get(entry, "contract_address"));
      // Use the first listed contract per wrapper to keep the probe cheap.
      const c = list[0];
      const address = str(get(c, "contract_address")) ?? str(get(entry, "platform", "token_address"));
      if (!address) {
        console.log(`     no contract address for ${w.asset}/${w.symbol} (crypto_id ${w.crypto_id})`);
        continue;
      }
      contracts.push({
        wrapper: w,
        address,
        platformSlug: str(get(c, "platform", "coin", "slug")) ?? str(get(entry, "platform", "slug")),
        platformName: str(get(c, "platform", "name")) ?? str(get(entry, "platform", "name")),
      });
    }
  } else {
    skip("crypto-info.wrappers", "/v2/cryptocurrency/info", "no wrapper tokens in quotes/latest");
  }

  // 10. DEX pools per contract: reference-doc params first, then the guide's variant
  const hasRows = (b: unknown) => arr(b).length > 0 || arr(get(b, "data")).length > 0;
  for (const c of contracts) {
    const slug = (c.platformSlug ?? c.platformName ?? "").toLowerCase();
    const chain = DEX_PLATFORM_ALIASES[slug] ?? slug;
    if (!chain) {
      skip(`dex-token-pools.${c.wrapper.symbol}`, "/v1/dex/token/pools", "no platform for contract");
      continue;
    }
    const base = `dex-token-pools.${c.wrapper.asset}.${c.wrapper.symbol}.${chain}`;
    const first = await call(base, "/v1/dex/token/pools", { platform: chain, address: c.address, size: 10 });
    if (!ok(first.status) || !hasRows(first.body)) {
      await call(`${base}.alt-params`, "/v1/dex/token/pools", { network_slug: chain, contract_address: c.address, size: 10 });
    }
  }

  // 11–14. market stress
  await call("fear-and-greed-latest", "/v3/fear-and-greed/latest");
  await call("liquidations-quotes-latest", "/v5/derivatives/liquidations/quotes/latest");
  await call("liquidations-exchange-list", "/v5/derivatives/liquidations/exchange/list/latest", { limit: 10 });
  await call("liquidations-cryptocurrency-list", "/v5/derivatives/liquidations/cryptocurrency/list/latest", { limit: 10 });

  // 1b. key info (end) → credit diff
  const keyEnd = await call("key-info.end", "/v1/key/info");
  const usedToday = (b: unknown) => get(b, "data", "usage", "current_day", "credits_used");
  const before = usedToday(keyStart.body);
  const after = usedToday(keyEnd.body);

  const summary = {
    generated_at: new Date().toISOString(),
    assets: ASSETS.map((a) => a.symbol),
    rwa_ids: rwaIds,
    plan: get(keyEnd.body, "data", "plan") ?? get(keyStart.body, "data", "plan"),
    credits_used_today: { before, after, delta: typeof before === "number" && typeof after === "number" ? after - before : null },
    results,
  };
  writeFileSync(join(FIXTURES, "_probe-summary.json"), JSON.stringify(summary, null, 2) + "\n");

  const okCount = results.filter((r) => ok(r.http_status)).length;
  console.log(`\n${okCount}/${results.length} calls OK. Credits today: ${before} → ${after}. Summary: fixtures/_probe-summary.json`);
}

main().catch((err) => {
  console.error("probe crashed:", err);
  process.exit(1);
});
