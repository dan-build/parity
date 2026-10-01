/**
 * Append one history snapshot per watched asset (scripts/watchlist.json).
 *
 *   npm run snapshot -- --kind auto     what the hourly workflow runs: a full check if the plan
 *                                       is big (≥100k credits/month), else prices hourly and a
 *                                       full check once a day
 *   npm run snapshot -- --kind prices   quotes only, 1 credit per asset
 *   npm run snapshot -- --kind full     the full check, ~5–7 credits per asset
 *   options: --out <dir> (default history/), --reserve <credits> (default 4000, or SNAPSHOT_RESERVE)
 *
 * Live data only, never the saved-data fallback: a rate-limited run records nothing and
 * exits non-zero so the workflow shows it. It skips (exit 0) when the month's credits left
 * would drop below the reserve kept for the live site. In CI the key comes from the
 * CMC_API_KEY secret; locally from .env.local.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { check } from "../lib/check";
import { createCmcClient, liveTransport, type Transport } from "../lib/cmc";
import { creditsLeft, dailyRow, historyPath, mayRun, monthlyLimit, pickKind, priceRow } from "../lib/history";

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

// 50 requests/min on the plan.
function throttled(inner: Transport, gapMs = 1_300): Transport {
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
  const client = createCmcClient({ transport: throttled(liveTransport(KEY)), source: "live" });

  const info = await client.get("/v1/key/info");
  const kind = asked === "auto" ? pickKind(info.ok ? monthlyLimit(info.data) : null, new Date().getUTCHours()) : asked;
  const cost = watchlist.length * (kind === "prices" ? 1 : 7);
  const gate = mayRun(info.ok ? creditsLeft(info.data) : null, cost, reserve);
  if (!gate.ok) {
    console.log(`::warning::Snapshot skipped: ${gate.why}`);
    return 0;
  }
  console.log(`${kind} snapshot of ${watchlist.length} assets (${gate.why})`);

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
      append(historyPath("prices", a.symbol, t), priceRow(q.data, t));
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
