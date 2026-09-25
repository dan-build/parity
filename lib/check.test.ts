import { beforeEach, describe, expect, it } from "vitest";
import { check, resolveQuery, type CheckResult } from "./check";
import { clearCmcCache, createCmcClient, type RwaMapEntry } from "./cmc";
import { fixtureTransport } from "./cmc-fixtures";

const fixtureClient = () => createCmcClient({ transport: fixtureTransport("fixtures"), source: "fixture" });

async function ok(q: string): Promise<CheckResult> {
  const out = await check(q, fixtureClient());
  if (out.kind !== "ok") throw new Error(`${q} → ${out.kind}`);
  return out.result;
}

beforeEach(() => clearCmcCache());

describe("check() end to end on fixtures", () => {
  it.each([
    ["GOLD", 1],
    ["NVDA", 2],
  ])("%s returns the full result shape", async (q, rwaId) => {
    const r = await ok(q);
    expect(r.asset.rwa_id).toBe(rwaId);
    expect(r).toHaveProperty("verdict");
    expect(r).toHaveProperty("reasons");
    expect(r).toHaveProperty("wrappers");
    expect(r).toHaveProperty("evidence");
    expect(r).toHaveProperty("gaps");
    expect(r.verdict).toBe("FAIR");
    expect(r.wrappers.length).toBeGreaterThan(0);
    const codes = r.gaps.map((g) => g.code);
    expect(codes).toContain("market_pairs_unavailable");
    expect(codes).toContain("no_underlying_price");
    expect(r.evidence.length).toBeGreaterThanOrEqual(3);
    expect(r.evidence.every((e) => e.source === "fixture" && e.status === 200)).toBe(true);
    expect(r.evidence.some((e) => e.endpoint === "/v1/dex/token/pools")).toBe(true);
  });

  it("NVDA reports pools with missing liquidity and unsupported chains as gaps", async () => {
    const codes = (await ok("NVDA")).gaps.map((g) => g.code);
    expect(codes).toContain("pool_liquidity_missing");
    expect(codes).toContain("pools_not_checked");
  });

  it("never calls market-pairs (403 on our plan)", async () => {
    const r = await ok("NVDA");
    expect(r.evidence.some((e) => e.endpoint.includes("market-pairs"))).toBe(false);
  });
});

describe("query resolution", () => {
  it.each([
    ["gold", 1],
    ["nvidia", 2],
    ["Nvidia Corp", 2],
    ["  nvda ", 2],
  ])("resolves %j", async (q, rwaId) => {
    expect((await ok(q)).asset.rwa_id).toBe(rwaId);
  });

  it("unknown query → not_found with suggestions", async () => {
    const out = await check("ZZZNOPE", fixtureClient());
    expect(out.kind).toBe("not_found");
    const partial = await check("nvid", fixtureClient());
    expect(partial.kind).toBe("not_found");
    if (partial.kind === "not_found") expect(partial.suggestions.map((s) => s.symbol)).toContain("NVDA");
  });

  it("on a symbol collision prefers the asset with tokens, then the best rank", () => {
    const e = (rwa_id: number, has_tokens: boolean, rwa_rank: number | null): RwaMapEntry => ({
      rwa_id,
      name: `Asset ${rwa_id}`,
      symbol: "DUP",
      slug: `asset-${rwa_id}`,
      asset_type: "stock",
      rwa_rank,
      has_tokens,
    });
    const { match, others } = resolveQuery("dup", [e(1, false, 1), e(2, true, 50), e(3, true, 9)]);
    expect(match?.rwa_id).toBe(3);
    expect(others.map((o) => o.rwa_id)).toEqual([2, 1]);
  });
});
