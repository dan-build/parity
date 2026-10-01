import { describe, expect, it } from "vitest";
import { coinTitle } from "./Instrument";

describe("coinTitle", () => {
  it("adds premium for priced coins", () => {
    expect(coinTitle("NVDA (Robinhood)", 0.06)).toBe(
      "NVDA (Robinhood) · +0.06% vs typical",
    );

    expect(coinTitle("NVDA (Robinhood)", -0.06)).toBe(
      "NVDA (Robinhood) · −0.06% vs typical",
    );
  });

  it("keeps ghost coins name-only", () => {
    expect(coinTitle("KAG", null)).toBe("KAG");
  });
});
