import { describe, expect, it } from "vitest";
import { check } from "./check";
import { clearCmcCache, createCmcClient, type Transport } from "./cmc";
import { fixtureTransport } from "./cmc-fixtures";
import { capturing, compareRuns, diffShapes, knownShapes, pairKey, shapeOf, type Captured } from "./drift";

async function run(q: string, transport: Transport) {
  clearCmcCache();
  const calls: Captured[] = [];
  const outcome = await check(q, createCmcClient({ transport: capturing(transport, calls), source: "fixture" }));
  return { calls, outcome };
}

/** The saved transport, with one response body rewritten for paths matching `path`. */
function tampered(path: string, edit: (body: unknown) => unknown): Transport {
  const inner = fixtureTransport("fixtures");
  return async (req) => {
    const res = await inner(req);
    return req.path === path ? { ...res, body: edit(structuredClone(res.body)) } : res;
  };
}

describe("shapes", () => {
  it("records paths and types, collapsing arrays and id keys, never values", () => {
    const s = shapeOf({ data: { "40685": { price: 1.5, tags: ["a"] } }, list: [{ v: null }, { v: 2 }] });
    expect([...s.keys()]).toEqual(["(root)", ".data", ".data.<id>", ".data.<id>.price", ".data.<id>.tags", ".data.<id>.tags[]", ".list", ".list[]", ".list[].v"]);
    expect([...s.get(".list[].v")!].sort()).toEqual(["null", "number"]);
    expect(JSON.stringify([...s.entries()].map(([k, v]) => [k, [...v]]))).not.toMatch(/1\.5|"a"/);
  });

  it("finds new, missing and retyped fields, ignoring the status block", () => {
    const d = diffShapes(shapeOf({ a: 1, b: "x", status: { t: "1" } }), shapeOf({ a: null, c: 1, status: { credit: 2 } }));
    expect(d).toEqual({ added: [".c"], removed: [".b"], changed: [{ path: ".a", saved: "number", live: "null" }] });
  });

  it("pairs a live spot conversion with its saved twin despite a different time", () => {
    const a = pairKey({ path: "/v2/tools/price-conversion", params: { id: 3575, amount: 1, time: "2026-09-25T10:00:00Z" } });
    const b = pairKey({ path: "/v2/tools/price-conversion", params: { amount: 1, id: 3575, time: "2026-10-09T03:00:00Z" } });
    expect(a).toBe(b);
  });
});

describe("comparing a saved run with a live one", () => {
  it("finds nothing when live answers exactly like the saved data", async () => {
    const s = await run("GOLD", fixtureTransport("fixtures"));
    const l = await run("GOLD", fixtureTransport("fixtures"));
    expect(s.calls.length).toBeGreaterThan(3);
    expect(compareRuns("GOLD", s, l)).toEqual([]);
  });

  it("warns when a field turns null, a field is renamed, or an endpoint starts failing", async () => {
    const s = await run("NVDA", fixtureTransport("fixtures"));
    const renamed = await run(
      "NVDA",
      tampered("/v5/real-world-assets/quotes/latest", (b) => {
        const asset = (b as { data: { rwa_assets: Record<string, unknown>[] } }).data.rwa_assets[0];
        asset.tokenised_market_cap = asset.tokenized_market_cap; // spelling change
        delete asset.tokenized_market_cap;
        asset.last_updated = null;
        return b;
      }),
    );
    const found = compareRuns("NVDA", s, renamed);
    const what = found.filter((f) => f.level === "warn").map((f) => f.what);
    expect(what).toEqual(expect.arrayContaining([expect.stringMatching(/new field .*tokenised_market_cap/), expect.stringMatching(/last_updated was string, now null/)]));
    // The old name, inside a list, is only info: list rows have optional fields. The new name is what warns.
    expect(found).toContainEqual(expect.objectContaining({ level: "info", what: expect.stringMatching(/field gone .*tokenized_market_cap/) }));

    const failing = await run("NVDA", async (req) => (req.path === "/v1/dex/token/pools" ? { status: 403, body: { status: { error_code: 1006 } } } : fixtureTransport("fixtures")(req)));
    expect(compareRuns("NVDA", s, failing).some((f) => f.level === "warn" && /HTTP 403, error_code 1006/.test(f.what))).toBe(true);
  });

  it("knows an endpoint's fields from every saved asset, so one asset's empty list doesn't make them all new", async () => {
    const nvda = await run("NVDA", fixtureTransport("fixtures"));
    const empty = await run("NVDA", tampered("/v1/dex/token/pools", (b) => ({ ...(b as object), data: [] })));
    const full = await run("NVDA", fixtureTransport("fixtures"));
    // Saved pools were empty for this asset; live has rows whose fields other saved responses have.
    expect(compareRuns("NVDA", empty, full, knownShapes([...nvda.calls, ...empty.calls])).filter((f) => f.level === "warn")).toEqual([]);
    expect(compareRuns("NVDA", empty, full, knownShapes(empty.calls)).some((f) => /new field .*\.data\[\]\.addr/.test(f.what))).toBe(true);
  });

  it("a value that was null and now has a number is the market filling in (info)", () => {
    const call = (body: unknown): Captured => ({ key: "/x", pair: "/x", path: "/x", status: 200, error_code: null, body });
    const f = compareRuns("MS", { calls: [call({ data: { price: null } })], outcome: { kind: "error", query: "MS", message: "", evidence: [] } }, { calls: [call({ data: { price: 1 } })], outcome: { kind: "error", query: "MS", message: "", evidence: [] } });
    expect(f).toEqual([{ level: "info", asset: "MS", what: "/x: .data.price was null, now number" }]);
  });

  it("reports a moved verdict as the market (info), not a warning", async () => {
    const s = await run("UNH", fixtureTransport("fixtures"));
    if (s.outcome.kind !== "ok") throw new Error("UNH");
    const moved = { ...s, outcome: { ...s.outcome, result: { ...s.outcome.result, verdict: "FAIR" as const } } };
    expect(compareRuns("UNH", s, moved)).toEqual([{ level: "info", asset: "UNH", what: "verdict moved: RICH → FAIR" }]);
  });
});
