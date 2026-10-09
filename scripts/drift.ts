/**
 * Live drift check: run every golden asset (evals/golden.json) on saved data and live, and
 * compare the shape of CoinMarketCap's responses plus what the engine concludes.
 *
 *   npm run drift            ~40–60 credits; paced at half the key's per-minute limit
 *
 * Warnings (exit 1) are possible new API surprises: a new or missing field, a type change
 * (e.g. a number that is now null), a new error, a token's unit changing. Investigate, then
 * add real ones to FRICTION.md and re-record with `npm run probe -- SYM`. Info lines (a moved
 * verdict, a new token or gap) are the market, not the API.
 *
 * The report (also saved to the git-ignored history/drift/) holds field paths, types,
 * symbols and our own verdicts only, never CoinMarketCap values.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { check } from "../lib/check";
import { clearCmcCache, createCmcClient, liveTransport } from "../lib/cmc";
import { fixtureTransport } from "../lib/cmc-fixtures";
import { capturing, compareRuns, knownShapes, type Captured, type Finding } from "../lib/drift";
import { paceMs, rateLimitPerMinute } from "../lib/history";
import { throttled } from "../lib/snapshot";

const root = resolve(__dirname, "..");
if (!process.env.CMC_API_KEY && existsSync(join(root, ".env.local"))) process.loadEnvFile(join(root, ".env.local"));
const KEY = process.env.CMC_API_KEY;
const golden = JSON.parse(readFileSync(join(root, "evals/golden.json"), "utf8")) as { q: string }[];

async function main() {
  if (!KEY) throw new Error("CMC_API_KEY is not set");
  const info = await createCmcClient({ transport: liveTransport(KEY), source: "live" }).get("/v1/key/info"); // 0 credits
  const gap = paceMs(info.ok ? rateLimitPerMinute(info.data) : null);
  const live = throttled(liveTransport(KEY), gap);
  const saved = fixtureTransport(join(root, "fixtures"));

  const run = async (q: string, transport: typeof live, source: "fixture" | "live") => {
    clearCmcCache(); // each run complete and independent: no saved answer may serve a live call
    const calls: Captured[] = [];
    const client = createCmcClient({ transport: capturing(transport, calls), source });
    const outcome = await check(q, client);
    const credits = client.evidence.reduce((n, e) => n + (e.cached ? 0 : (e.credit_count ?? 0)), 0);
    return { calls, outcome, credits };
  };
  // Saved runs first: together they define every field each endpoint is known to have.
  const savedRuns = new Map<string, Awaited<ReturnType<typeof run>>>();
  for (const { q } of golden) savedRuns.set(q, await run(q, saved, "fixture"));
  const known = knownShapes([...savedRuns.values()].flatMap((r) => r.calls));

  const findings: Finding[] = [];
  let credits = 0;
  for (const { q } of golden) {
    const l = await run(q, live, "live");
    credits += l.credits;
    const f = compareRuns(q, savedRuns.get(q)!, l, known);
    findings.push(...f);
    const w = f.filter((x) => x.level === "warn").length;
    console.log(`${w ? "⚠" : "✓"} ${q}${w ? `: ${w} warning${w > 1 ? "s" : ""}` : ""}`);
  }

  const warns = findings.filter((f) => f.level === "warn");
  const lines = [
    `# Drift check ${new Date().toISOString()}`,
    ``,
    `${golden.length} golden assets, ${credits} credits, one call every ${gap} ms. ${warns.length} warning(s).`,
    ``,
    `## Warnings (possible API changes)`,
    ...(warns.length ? warns.map((f) => `- ${f.asset}: ${f.what}`) : ["- none"]),
    ``,
    `## Info (the market moving)`,
    ...(findings.some((f) => f.level === "info") ? findings.filter((f) => f.level === "info").map((f) => `- ${f.asset}: ${f.what}`) : ["- none"]),
  ];
  const dir = join(root, "history", "drift");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${new Date().toISOString().slice(0, 16).replace(":", "-")}.md`); // one per run
  writeFileSync(file, lines.join("\n") + "\n");
  console.log("\n" + lines.slice(2).join("\n") + `\n\nSaved to ${file.replace(root + "/", "")}`);
  return warns.length ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error("drift failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
