import { describe, expect, it } from "vitest";
import { tickerFont } from "./RingCoin";

describe("tickerFont", () => {
  it("shrinks long tickers but never below 8px", () => {
    expect(tickerFont(42, "PAXG")).toBeGreaterThan(tickerFont(42, "WNVDAX"));
    expect(tickerFont(34, "WNVDAX")).toBe(8);
    expect(tickerFont(34, "#39318")).toBe(8);
  });

  it("keeps short tickers at the coin's natural size", () => {
    expect(tickerFont(42, "CGO")).toBeCloseTo(42 * 0.26);
  });
});
