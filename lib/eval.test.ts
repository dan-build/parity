import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { clearCmcCache } from "./cmc";
import { checkGolden, diffSnapshot, snapshot, type Baseline, type GoldenCase } from "./eval";
import { runCheck, type CheckBody } from "./run-check";
import { METHOD_VERSION } from "./verdict";

const golden = JSON.parse(readFileSync(join(process.cwd(), "evals/golden.json"), "utf8")) as GoldenCase[];
const baseline = JSON.parse(readFileSync(join(process.cwd(), "evals/baseline.json"), "utf8")) as Baseline;
type Ok = Extract<CheckBody, { ok: true }>;
const load = async (q: string) => (await runCheck(q, "fixture")).body as Ok;

beforeEach(() => clearCmcCache());

describe("golden set", () => {
  it.each(golden.map((c) => [c.q, c] as const))("%s holds", async (_q, c) => {
    expect(checkGolden(c, await load(c.q))).toEqual([]);
  });

  it("covers all four verdicts", () => {
    expect(new Set(golden.map((c) => c.verdict))).toEqual(new Set(["FAIR", "RICH", "THIN", "GHOST"]));
  });

  it("matches the committed baseline, made by this method version", async () => {
    expect(baseline.method_version).toBe(METHOD_VERSION);
    for (const c of golden) expect(diffSnapshot(c.q, baseline.assets[c.q], snapshot(await load(c.q)))).toEqual([]);
  });
});

describe("the evaluator catches what it should", () => {
  it("fails a wrong verdict, a missing reason and a wrong tile", async () => {
    const body = await load("GOLD");
    const wrong: GoldenCase = { q: "GOLD", why: "", verdict: "RICH", answer: "best way in · XAUt", reasons_include: ["^nope"], tiles: { "Typical price": "$1.00" } };
    const miss = checkGolden(wrong, body);
    expect(miss.some((m) => m.includes("verdict should be"))).toBe(true);
    expect(miss.some((m) => m.includes("no reason matches"))).toBe(true);
    expect(miss.some((m) => m.includes('tile "Typical price"'))).toBe(true);
  });

  it('flags "buy" and raw ids in the words a reader sees', async () => {
    const body = await load("SILVER");
    const bad = { ...body, wrappers: body.wrappers.map((w, i) => (i === 0 ? { ...w, display: "#39318", symbol: "#39318" } : w)) };
    const c = golden.find((g) => g.q === "SILVER")!;
    expect(checkGolden(c, bad).some((m) => m.includes("raw id"))).toBe(true);
    const buy = { ...body, wrappers: body.wrappers.map((w, i) => (i === 0 ? { ...w, display: "buy KAG", symbol: "buy KAG" } : w)) };
    expect(checkGolden(c, buy).some((m) => m.includes('says "buy"'))).toBe(true);
  });

  it("reports every changed number in the baseline diff", async () => {
    const s = snapshot(await load("UNH"));
    const id = Object.keys(s.tokens)[0];
    const moved = { ...s, verdict: "FAIR", tokens: { ...s.tokens, [id]: { ...s.tokens[id], premium_pct: 9.99 } } };
    const d = diffSnapshot("UNH", s, moved);
    expect(d).toContain('UNH: verdict "RICH" → "FAIR"');
    expect(d.some((x) => x.includes("premium_pct") && x.includes("9.99"))).toBe(true);
  });
});
