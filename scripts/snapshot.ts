/**
 * Append one history snapshot per watched asset (scripts/watchlist.json).
 *
 *   npm run snapshot -- --kind auto     a full check if the plan
 *                                       is big (≥100k credits/month), else prices hourly and a
 *                                       full check once a day
 *   npm run snapshot -- --kind prices   quotes only, 1 credit per asset
 *   npm run snapshot -- --kind full     the full check, ~5–7 credits per asset
 *   options: --out <dir> (default history/), --reserve <credits> (default 4000, or SNAPSHOT_RESERVE)
 *
 * Live data only, never the saved-data fallback: a rate-limited run records nothing and
 * exits non-zero. It skips (exit 0) when the month's credits left would drop below the
 * reserve kept for the live site. The key comes from .env.local.
 *
 * PRIVATE: history/ is git-ignored. CoinMarketCap's terms allow storing data for your own
 * product, not making it available to third parties, so this history is never published.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { check, metalFor } from "../lib/check";
import { createCmcClient, liveTransport, type Transport } from "../lib/cmc";
import { creditsLeft, dailyRow, historyPath, mayRun, monthlyLimit, paceMs, pickKind, priceRow, rateLimitPerMinute } from "../lib/history";

const root = resolve(__dirname, "..");
if (!process.env.CMC_API_KEY && existsSync(join(root, ".env.local"))) process.loadEnvFile(join(root, ".env.local"));
const KEY = process.env.CMC_API_KEY;

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const asked = arg("kind");
const out = resolve(arg("out") ?? join(root, "history"));
const reserve = Number(arg("reserve") ?? process.env.SNAPSHOT_RESERVE ?? 4000);
const watchlist = JSON.parse(readFileSync(join(root, "scripts/watchlist.json"), "utf8")) as { symbol: string; rwa_id: number }[];

// Paced from the key's own per-minute limit (see paceMs), so the live site keeps headroom.
function throttled(inner: Transport, gapMs: number): Transport {
  let last = 0;
  let chain: Promise<unknown> = Promise.resolve();
  return (req) => {
    const run = chain.then(async () => {
      const wait = last + gapMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      last = Date.now();
      return inner(req);
    });
    chain = run.catch(() => undefined);
    return run;
  };
}

function append(file: string, row: unknown) {
  const p = join(out, file);
  mkdirSync(dirname(p), { recursive: true });
  appendFileSync(p, JSON.stringify(row) + "\n");
}

async function main() {
  if (asked !== "prices" && asked !== "full" && asked !== "auto") throw new Error("--kind auto|prices|full is required");
  if (!KEY) throw new Error("CMC_API_KEY is not set");
  const info = await createCmcClient({ transport: liveTransport(KEY), source: "live" }).get("/v1/key/info"); // 0 credits
  const gap = paceMs(info.ok ? rateLimitPerMinute(info.data) : null);
  const client = createCmcClient({ transport: throttled(liveTransport(KEY), gap), source: "live" });
  const kind = asked === "auto" ? pickKind(info.ok ? monthlyLimit(info.data) : null, new Date().getUTCHours()) : asked;
  const cost = watchlist.length * (kind === "prices" ? 1 : 7) + 2; // + spot for gold and silver
  const gate = mayRun(info.ok ? creditsLeft(info.data) : null, cost, reserve);
  if (!gate.ok) {
    console.log(`::warning::Snapshot skipped: ${gate.why}`);
    return 0;
  }
  console.log(`${kind} snapshot of ${watchlist.length} assets (${gate.why}; one call every ${gap} ms)`);

  const t = new Date().toISOString();
  let failed = 0;
  for (const a of watchlist) {
    if (kind === "prices") {
      const q = await client.rwaQuotesLatest(a.rwa_id);
      if (!q.ok || !q.data) {
        failed++;
        console.log(`✗ ${a.symbol}: ${q.ok ? "no data" : q.message}`);
        continue;
      }
      const metal = metalFor(q.data);
      const s = metal ? await client.metalSpot(metal, q.data.last_updated) : null;
      append(historyPath("prices", a.symbol, t), priceRow(q.data, t, s?.ok ? { code: metal as string, ...s.data } : null));
      console.log(`✓ ${a.symbol}`);
    } else {
      const r = await check(a.symbol, client);
      if (r.kind !== "ok" || r.result.asset.rwa_id !== a.rwa_id) {
        failed++;
        console.log(`✗ ${a.symbol}: ${r.kind === "ok" ? `resolved to rwa_id ${r.result.asset.rwa_id}, expected ${a.rwa_id}` : r.kind === "error" ? r.message : "not found"}`);
        continue;
      }
      append(historyPath("daily", a.symbol, t), dailyRow(r.result, t));
      console.log(`✓ ${a.symbol} ${r.result.verdict}`);
    }
  }
  const spent = client.evidence.reduce((n, e) => n + (e.cached ? 0 : (e.credit_count ?? 0)), 0);
  console.log(`${watchlist.length - failed}/${watchlist.length} recorded, ${spent} credits.`);
  return failed ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error("snapshot failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
