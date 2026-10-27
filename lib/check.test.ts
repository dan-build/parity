import { beforeEach, describe, expect, it } from "vitest";
import { check, resolveQuery, SPOT_MAX_GAP_MIN, suggest, type CheckResult } from "./check";
import { clearCmcCache, createCmcClient, type RwaMapEntry, type Transport } from "./cmc";
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
    // Metals are measured against CMC's spot price; stocks have no underlying price in CMC.
    if (q === "GOLD") {
      expect(codes).not.toContain("no_underlying_price");
      expect(r.reference).toMatchObject({ method: "metal_spot", spot: { code: "XAU", price_usd: expect.any(Number) } });
      expect(r.evidence.some((e) => e.endpoint === "/v2/tools/price-conversion" && e.params.time === r.data_as_of)).toBe(true);
    } else {
      expect(codes).toContain("no_underlying_price");
      expect(r.reference.method).toBe("median_of_live_wrappers");
    }
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

describe("suggestions for a query that finds nothing", () => {
  const entries = [
    { rwa_id: 1, name: "Gold", symbol: "GOLD", slug: "gold", asset_type: "commodity" as const, rwa_rank: 1, has_tokens: true },
    { rwa_id: 2, name: "NVIDIA Corp", symbol: "NVDA", slug: "nvidia", asset_type: "stock" as const, rwa_rank: 2, has_tokens: true },
    { rwa_id: 9, name: "Goldcorp", symbol: "GG", slug: "goldcorp", asset_type: "stock" as const, rwa_rank: 50, has_tokens: false },
  ];
  it("catches an extra letter, a typo and a partial name, and skips assets without tokens", () => {
    expect(suggest("GOLDD", entries).map((s) => s.symbol)).toEqual(["GOLD"]);
    expect(suggest("NVDIA", entries).map((s) => s.symbol)).toEqual(["NVDA"]);
    expect(suggest("nvidi", entries).map((s) => s.symbol)).toEqual(["NVDA"]);
    expect(suggest("zzzz", entries)).toEqual([]);
  });
});

describe("metal spot when CoinMarketCap's time-pinned answer is empty (FRICTION.md #14)", () => {
  /** Saved data, except the time-pinned conversion answers like the live quirk, and a latest-spot call answers `minutesAway` from the quotes. */
  function quirky(minutesAway: number, pinnedStatus = 200) {
    const saved = fixtureTransport("fixtures");
    const calls: string[] = [];
    let spotAt = "";
    let lastPrice = 0;
    const transport: Transport = async (req) => {
      if (req.path !== "/v2/tools/price-conversion") return saved(req);
      calls.push(req.params.time ? "pinned" : "latest");
      if (req.params.time) {
        const real = await saved(req); // the saved answer for that time: its price and moment
        const d = (real.body as { data: { quote: { USD: { price: number; last_updated: string } } } }).data;
        spotAt = new Date(Date.parse(String(req.params.time)) + minutesAway * 60_000).toISOString();
        lastPrice = d.quote.USD.price;
        if (pinnedStatus !== 200) return { status: pinnedStatus, body: { status: { error_code: 1008, error_message: "rate limited" } } };
        return { status: 200, body: { status: { error_code: 0 }, data: { id: 3575, symbol: "XAU", name: "Gold Troy Ounce", amount: 1 } } };
      }
      return { status: 200, body: { status: { error_code: 0 }, data: { id: 3575, symbol: "XAU", amount: 1, quote: { USD: { price: lastPrice, last_updated: spotAt } }, last_updated: spotAt } } };
    };
    return { transport, calls };
  }
  const run = async (t: Transport) => {
    const out = await check("GOLD", createCmcClient({ transport: t, source: "fixture" }));
    if (out.kind !== "ok") throw new Error(out.kind);
    return out.result;
  };

  it(`uses the latest spot when it's within ${SPOT_MAX_GAP_MIN} minutes, and says so`, async () => {
    const q = quirky(4);
    const r = await run(q.transport);
    expect(q.calls).toEqual(["pinned", "latest"]);
    expect(r.reference.method).toBe("metal_spot");
    expect(r.gaps.map((g) => g.code)).toContain("spot_latest");
    expect(r.gaps.map((g) => g.code)).not.toContain("spot_unavailable");
    expect(r.gaps.find((g) => g.code === "spot_latest")?.message).toMatch(/latest one is used \(4 min apart\)/);
    expect(r.verdict).toBe((await ok("GOLD")).verdict); // same spot price, same answer
  });

  it(`refuses a latest spot more than ${SPOT_MAX_GAP_MIN} minutes away: tokens are compared with each other, as before`, async () => {
    const r = await run(quirky(SPOT_MAX_GAP_MIN + 5).transport);
    expect(r.reference.method).toBe("median_of_live_wrappers");
    expect(r.gaps.find((g) => g.code === "spot_unavailable")?.message).toMatch(/latest is 20 min away/);
  });

  it("doesn't retry after a real error (a rate limit isn't the quirk)", async () => {
    const q = quirky(1, 429);
    const r = await run(q.transport);
    expect(q.calls).toEqual(["pinned"]);
    expect(r.gaps.map((g) => g.code)).toContain("spot_unavailable");
  });
});
