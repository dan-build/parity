/**
 * Cheap screen for demo assets: which RWA assets would the engine call RICH or GHOST?
 *
 * Reads the asset list from the saved map (fixtures/, 0 credits), then pulls live
 * quotes/latest (1 credit each) and runs the real verdict() on them without contracts
 * or pools. Without pool depth an exit score can only be lower, so a THIN here may be
 * FAIR/RICH for real; a RICH or GHOST here is worth recording with `npm run probe -- SYM`.
 *
 * Run: npm run scan -- [--budget 120]    (reads CMC_API_KEY from .env.local; saves nothing)
 */
import { join } from "node:path";
import { createCmcClient, liveTransport, type Transport } from "@/lib/cmc";
import { fixtureTransport } from "@/lib/cmc-fixtures";
import { verdict } from "@/lib/verdict";

const KEY = process.env.CMC_API_KEY;
if (!KEY) {
  console.error("CMC_API_KEY missing. Put it in .env.local and run `npm run scan`.");
  process.exit(1);
}
const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : fallback;
};
const BUDGET = arg("budget", 120);
const KNOWN = new Set(["GOLD", "NVDA", "SPY", "TSLA", "AAPL", "SILVER"]);

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

const saved = createCmcClient({ transport: fixtureTransport(join(process.cwd(), "fixtures")), source: "fixture" });
const live = createCmcClient({ transport: throttled(liveTransport(KEY)), source: "live" });

async function creditsToday(): Promise<number | null> {
  const r = await live.get("/v1/key/info");
  const d = r.ok ? (r.data as { data?: { usage?: { current_day?: { credits_used?: number } } } }) : null;
  return d?.data?.usage?.current_day?.credits_used ?? null;
}

async function main() {
  const map = await saved.rwaMap();
  if (!map.ok) throw new Error(`saved map unavailable: ${map.message}`);
  const candidates = map.data
    .filter((e) => e.has_tokens && !KNOWN.has(e.symbol))
    .sort((a, b) => (a.rwa_rank ?? Infinity) - (b.rwa_rank ?? Infinity));
  console.log(`${map.data.length} assets in the saved map, ${candidates.length} candidates with tokens.\n`);

  const before = await creditsToday();
  const found: Record<string, string[]> = { RICH: [], GHOST: [], FAIR: [], THIN: [] };
  let spent = 0;

  for (const e of candidates) {
    if (spent >= BUDGET) break;
    if (found.RICH.length >= 3 && found.GHOST.length >= 3) break;
    const q = await live.rwaQuotesLatest(e.rwa_id);
    spent += 1;
    if (!q.ok || !q.data) {
      console.log(`  ${e.symbol.padEnd(8)} quotes failed: ${q.ok ? "no data" : q.message}`);
      if (!q.ok && /429|rate/i.test(q.message)) break;
      continue;
    }
    const d = q.data;
    const tokens = d.tokens.filter((t) => typeof t.crypto_id === "number");
    const r = verdict({
      asset: {
        rwa_id: d.rwa_id,
        name: d.name,
        symbol: d.symbol,
        asset_type: d.asset_type,
        average_tokenized_price: d.average_tokenized_price,
        tradfi_markets: d.tradfi_markets,
      },
      tokens,
      contracts: new Map(),
      pools: new Map(),
    });
    const best = r.wrappers.find((w) => w.crypto_id === r.headline_crypto_id);
    found[r.verdict].push(e.symbol);
    const prem = r.wrappers
      .filter((w) => w.verdict !== "GHOST")
      .map((w) => `${w.display} ${(w.premium_pct ?? 0).toFixed(2)}% vol $${Math.round(w.volume_24h ?? 0)}`)
      .join(" | ");
    console.log(
      `${r.verdict.padEnd(6)} ${e.symbol.padEnd(8)} rank ${String(e.rwa_rank ?? "—").padEnd(4)} ${tokens.length} tokens` +
        `${best ? ` best ${best.display}` : ""}${prem ? `  [${prem}]` : ""}`,
    );
  }

  const after = await creditsToday();
  console.log(`\nRICH: ${found.RICH.join(", ") || "none"}\nGHOST: ${found.GHOST.join(", ") || "none"}`);
  console.log(`quotes calls: ${spent}. Credits today: ${before} → ${after}.`);
}

main().catch((err) => {
  console.error("scan crashed:", err);
  process.exit(1);
});
