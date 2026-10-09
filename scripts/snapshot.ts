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
import { liveTransport } from "../lib/cmc";
import { takeSnapshot, type WatchedAsset } from "../lib/snapshot";

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
const watchlist = JSON.parse(readFileSync(join(root, "scripts/watchlist.json"), "utf8")) as WatchedAsset[];

async function main() {
  if (asked !== "prices" && asked !== "full" && asked !== "auto") throw new Error("--kind auto|prices|full is required");
  if (!KEY) throw new Error("CMC_API_KEY is not set");

  const r = await takeSnapshot({ transport: liveTransport(KEY), kind: asked, watchlist, reserve });
  if (r.skipped) {
    console.log(`::warning::Snapshot skipped: ${r.skipped}`);
    return 0;
  }
  for (const { file, row } of r.rows) {
    const p = join(out, file);
    mkdirSync(dirname(p), { recursive: true });
    appendFileSync(p, JSON.stringify(row) + "\n");
    console.log(`✓ ${row.symbol}${row.kind === "full" ? ` ${row.verdict}` : ""}`);
  }
  for (const f of r.failures) console.log(`✗ ${f}`);
  console.log(`${r.kind} snapshot: ${r.rows.length}/${watchlist.length} recorded, ${r.credits} credits, one call every ${r.pace_ms} ms.`);
  return r.failures.length ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error("snapshot failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
