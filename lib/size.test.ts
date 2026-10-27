import { describe, expect, it } from "vitest";
import { isTradablePair } from "./verdict";
import { DEFAULT_SIZE, MAX_IMPACT, sizeCost, sizeFrom } from "./size";

const w = (premium_pct: number | null, tradable: number | null, checked = true) => ({
  premium_pct,
  dex: { checked, not_checked_reason: null, pools: 1, pools_missing_liquidity: 0, liquidity_usd: tradable, biggest_pool: null, tradable_liquidity_usd: tradable },
});

describe("cost at your size", () => {
  it("adds the premium and price impact both ways, from the pool formula", () => {
    // $1M depth → $500k on the dollar side; $10k moves the average price 2% each way.
    const c = sizeCost(w(0.1, 1_000_000), 10_000);
    expect(c).toMatchObject({ kind: "estimate", premium_usd: 10, impact: 0.02, in_usd: 210, out_usd: 200, total_usd: 410, depth_usd: 1_000_000 });
    if (c.kind === "estimate") expect(c.total_pct).toBeCloseTo(4.1, 6);
  });

  it("matches the exact constant-product average price for one leg", () => {
    // Buying S into a pool with x dollars: tokens out = y·S/(x+S), so the average price is p0·(1 + S/x).
    const x = 250_000, S = 5_000, y = 100; // p0 = x / y
    const avg = S / ((y * S) / (x + S));
    const c = sizeCost(w(0, x * 2), S);
    expect(c.kind === "estimate" && c.impact).toBeCloseTo(avg / (x / y) - 1, 12);
  });

  it("a discount lowers the cost of getting in", () => {
    const c = sizeCost(w(-0.5, 10_000_000), 1_000);
    expect(c.kind === "estimate" && c.premium_usd).toBe(-5);
  });

  it("says when the pools are too shallow, and never guesses unknown depth", () => {
    expect(sizeCost(w(0, 50_000), 100_000)).toMatchObject({ kind: "too_big" });
    expect(sizeCost(w(0, 4 * 100_000 / (2 * MAX_IMPACT)), 100_000).kind).toBe("estimate"); // just inside
    expect(sizeCost(w(0, null), 1_000)).toMatchObject({ kind: "unknown", reason: "no_tradable_depth" });
    expect(sizeCost(w(0, 1_000_000, false), 1_000)).toMatchObject({ kind: "unknown", reason: "pools_not_checked" });
    expect(sizeCost(w(null, 1_000_000), 1_000)).toMatchObject({ kind: "unknown", reason: "no_price" });
  });

  it("only offers the sizes on the page", () => {
    expect(sizeFrom("1000")).toBe(1_000);
    expect(sizeFrom("100000")).toBe(100_000);
    expect(sizeFrom("12345")).toBe(DEFAULT_SIZE);
    expect(sizeFrom(null)).toBe(DEFAULT_SIZE);
  });

  it("counts only pools a buyer can route through: paired with dollars or a major coin", () => {
    expect(isTradablePair("USDC/MSFTc")).toBe(true);
    expect(isTradablePair("XAUt/WETH")).toBe(true);
    expect(isTradablePair("MSFTc/BLUESCREEN")).toBe(false);
    expect(isTradablePair("VNXAU/PAXG")).toBe(false);
  });
});
