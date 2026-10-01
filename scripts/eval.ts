/**
 * npm run eval            → golden set + baseline diff over saved data (CI runs this)
 * npm run eval -- --update → after a deliberate method change: rewrite evals/baseline.json
 *
 * Fails when a golden case misses, or when verdicts/numbers change while METHOD_VERSION in
 * lib/verdict.ts stays the same (bump it and add a METHOD.md changelog entry first).
 * Saved data only: no key, no credits, same answer every run.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { clearCmcCache } from "../lib/cmc";
import { checkGolden, diffSnapshot, snapshot, type Baseline, type GoldenCase } from "../lib/eval";
import { runCheck } from "../lib/run-check";
import { METHOD_VERSION } from "../lib/verdict";

const DIR = join(process.cwd(), "evals");
const BASELINE = join(DIR, "baseline.json");
const update = process.argv.includes("--update");

async function main() {
  const golden = JSON.parse(readFileSync(join(DIR, "golden.json"), "utf8")) as GoldenCase[];
  const before: Baseline | null = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : null;
  const after: Baseline = { method_version: METHOD_VERSION, assets: {} };

  const misses: string[] = [];
  console.log(`Parity eval · method ${METHOD_VERSION} · ${golden.length} golden cases (saved data)\n`);
  for (const c of golden) {
    clearCmcCache();
    const { body } = await runCheck(c.q, "fixture");
    const m = checkGolden(c, body);
    misses.push(...m);
    if (body.ok) after.assets[c.q] = snapshot(body);
    console.log(`${m.length ? "✗" : "✓"} ${c.q.padEnd(7)} ${body.ok ? body.verdict.padEnd(6) : "—     "} ${c.why}`);
    for (const x of m) console.log(`    ${x}`);
  }

  const diffs = golden.flatMap((c) => (after.assets[c.q] ? diffSnapshot(c.q, before?.assets[c.q], after.assets[c.q]) : []));
  console.log(`\nGolden: ${golden.length - new Set(misses.map((m) => m.split(":")[0])).size}/${golden.length} pass`);
  console.log(`Baseline: ${before ? (diffs.length ? `${diffs.length} change(s) since method ${before.method_version}` : "no changes") : "none yet"}`);
  for (const d of diffs) console.log(`    ${d}`);

  if (update) {
    writeFileSync(BASELINE, JSON.stringify(after, null, 2) + "\n");
    console.log(`\nWrote evals/baseline.json for method ${METHOD_VERSION}.`);
  }

  const unversioned = !update && before !== null && diffs.length > 0 && before.method_version === METHOD_VERSION;
  if (unversioned) {
    console.log(
      `\n✗ The output changed but METHOD_VERSION is still ${METHOD_VERSION}. If the change is intended: bump METHOD_VERSION ` +
        "in lib/verdict.ts, add a METHOD.md changelog entry saying why, then run `npm run eval -- --update`.",
    );
  }
  if (!before && !update) console.log("\nNo baseline yet: run `npm run eval -- --update` to create it.");
  process.exit(misses.length || unversioned || (!before && !update) ? 1 : 0);
}

main().catch((err) => {
  console.error("eval crashed:", err);
  process.exit(1);
});
