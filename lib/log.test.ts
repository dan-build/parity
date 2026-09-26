import { beforeEach, describe, expect, it } from "vitest";
import { clearCmcCache, type EvidenceEntry } from "./cmc";
import { logLines, logSummary } from "./log";
import type { CheckResponse } from "./present";
import { T } from "./reveal/timings";
import { runCheck } from "./run-check";

async function load(q: string): Promise<CheckResponse> {
  const { body } = await runCheck(q, "fixture");
  if (!body.ok) throw new Error(body.message);
  return body;
}

const callsIn = (r: CheckResponse) => logLines(r).reduce((n, l) => n + l.calls, 0);

beforeEach(() => clearCmcCache());

describe("logLines", () => {
  it.each(["GOLD", "NVDA", "SPY", "TSLA", "AAPL", "SILVER"])("narrates every call for %s", async (q) => {
    const r = await load(q);
    expect(callsIn(r)).toBe(logSummary(r).calls);
    expect(logSummary(r).calls).toBe(r.evidence.length);
  });

  it("gives each pool call its own line, named by token and chain", async () => {
    const lines = logLines(await load("GOLD"));
    const pools = lines.filter((l) => l.text.startsWith("pools · "));
    expect(pools).toHaveLength(4);
    expect(pools.map((l) => l.text)).toContain("pools · PAXG");
    expect(pools.every((l) => l.meta.startsWith("ethereum · "))).toBe(true);
  });

  it("narrates Fear & Greed with its reading", async () => {
    const line = logLines(await load("GOLD")).find((l) => l.text === "fear & greed")!;
    expect(line.meta).toMatch(/^\d+ [a-z ]+ · \d+ credits?$/);
  });

  it("finishes every call line before the first finding, in time order", async () => {
    const lines = logLines(await load("GOLD"));
    const lastCall = Math.max(...lines.filter((l) => l.calls).map((l) => l.at));
    expect(lastCall).toBeLessThan(T.callout.start);
    expect(lines.map((l) => l.at)).toEqual([...lines.map((l) => l.at)].sort((a, b) => a - b));
  });

  it("folds paged map calls into one line and still counts them all", async () => {
    const r = await load("GOLD");
    const page = (start: number): EvidenceEntry => ({ ...r.evidence[0], params: { start, limit: 200 } });
    const paged = { ...r, evidence: [page(1), page(201), page(401), ...r.evidence.slice(1)] };
    const map = logLines(paged).find((l) => l.text.startsWith("rwa/map"))!;
    expect(map).toMatchObject({ text: "rwa/map ×3", calls: 3 });
    expect(callsIn(paged)).toBe(paged.evidence.length);
  });

  it("shows a failed call as a failure, not a success", async () => {
    const r = await load("GOLD");
    const failed = { ...r, evidence: [...r.evidence, { ...r.evidence[1], endpoint: "/v5/real-world-assets/market-pairs/list", status: 403, error_code: "1006" }] };
    expect(logLines(failed).find((l) => l.tone === "fail")).toMatchObject({ text: "rwa/market-pairs/list", meta: "403 · 1006" });
  });

  it("counts a live cache hit as free", async () => {
    const r = await load("GOLD");
    const cached = { ...r, evidence: r.evidence.map((e) => ({ ...e, source: "live" as const, cached: true })) };
    expect(logSummary(cached).credits).toBe(0);
  });

  it("never tells anyone to buy", async () => {
    for (const q of ["GOLD", "SILVER"]) expect(logSummary(await load(q)).verdictLine).not.toMatch(/\bbuy\b/i);
  });
});
