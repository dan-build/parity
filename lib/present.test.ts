import { beforeEach, describe, expect, it } from "vitest";
import { clearCmcCache } from "./cmc";
import { exitMeter, moneyShort, pct, present, type CheckResponse } from "./present";
import { runCheck } from "./run-check";

async function load(q: string): Promise<CheckResponse> {
  const { body } = await runCheck(q); // fixture mode is the default
  if (!body.ok) throw new Error(body.message);
  return body;
}

beforeEach(() => clearCmcCache());

describe("formatting", () => {
  it("uses a true minus sign and $ with sensible precision", () => {
    expect(pct(0.14)).toBe("+0.14%");
    expect(pct(-0.14)).toBe("−0.14%");
    expect(moneyShort(5.1)).toBe("$5.10");
    expect(moneyShort(33.4)).toBe("$33");
    expect(moneyShort(23_200_000)).toBe("$23.2M");
  });

  it("maps exit scores to 5 bars and a word", () => {
    expect(exitMeter(null)).toEqual({ bars: 0, word: "None" });
    expect(exitMeter(100)).toEqual({ bars: 5, word: "Deep" });
    expect(exitMeter(60)).toEqual({ bars: 4, word: "Good" });
    expect(exitMeter(45)).toEqual({ bars: 3, word: "Some" });
    expect(exitMeter(25)).toEqual({ bars: 2, word: "Thin" });
  });
});

describe("present(GOLD)", () => {
  it("writes the headline, reasons and instrument in the design's voice", async () => {
    const v = present(await load("GOLD"));
    expect(v.headline).toMatchObject({ verdict: "FAIR", word: "Fair", sub: "if you pick the right token." });
    expect(v.asset.claimLine).toBe("7 tokens claim to be it");
    expect(v.reasons.length).toBeGreaterThan(0);
    expect(v.reasons.length).toBeLessThanOrEqual(4);
    expect(v.reasons.find((r) => r.tone === "unit")?.strong).toBe("2 are priced per gram.");
    // Honest label: the needle is the typical token price, not the spot price.
    expect(v.instrument.reference.label).toBe("Gold tokens");
    expect(v.instrument.zone?.label).toMatch(/^Looks 9\d% cheaper$/);
    expect(v.list.unitLine).toMatch(/^Per troy ounce/);
  });

  it("notes the per-gram conversion on the row, in gold", async () => {
    const v = present(await load("GOLD"));
    const cgo = v.list.rows.find((r) => r.ticker === "CGO")!;
    expect(cgo.priceNote).toEqual({ text: expect.stringMatching(/^Converted from \$1\d\d\.\d\d per gram$/), tone: "unit" });
  });

  it("labels pool calls by wrapper and chain, and shows market-pairs as not called", async () => {
    const v = present(await load("GOLD"));
    expect(v.evidence.some((e) => e.label === "GET /v1/dex/token/pools · PAXG on ethereum")).toBe(true);
    const mp = v.evidence.find((e) => e.id === "market-pairs")!;
    expect(mp).toMatchObject({ ok: false, meta: "403", static: true });
    expect(mp.note).toMatch(/^Not called/);
  });

  it("shows the quotes excerpt as average price + each token's symbol, issuer and price", async () => {
    const v = present(await load("GOLD"));
    const q = v.evidence.find((e) => e.label.includes("/quotes/latest"))!;
    const ex = q.excerpt as { average_tokenized_price: number; tokens: unknown[] };
    expect(typeof ex.average_tokenized_price).toBe("number");
    expect(ex.tokens[0]).toEqual({ symbol: expect.any(String), issuer_name: expect.any(String), price: expect.any(Number) });
  });
});

describe("present(other assets)", () => {
  it("NVDA: per share, both NVDA wrappers kept, two ghosts in one note", async () => {
    const v = present(await load("NVDA"));
    expect(v.list.unitLine).toMatch(/^Per share/);
    expect(v.list.rows.filter((r) => r.ticker === "NVDA")).toHaveLength(2);
    expect(v.instrument.ghostNote).toMatch(/^2 listings fell through/);
    expect(v.route?.ticker).toBeTruthy();
  });

  it("SILVER: THIN headline, singular per-gram copy, off-track reason", async () => {
    const v = present(await load("SILVER"));
    expect(v.headline.verdict).toBe("THIN");
    expect(v.reasons.find((r) => r.tone === "unit")?.rest).toBe(" We converted it so you can compare.");
    expect(v.reasons.some((r) => r.tone === "off" && /KAG is \d+% off/.test(r.strong))).toBe(true);
    for (const row of v.list.rows) expect(row.ticker).not.toBe("null");
  });
});

describe("summary tiles", () => {
  it("gives the hero four plain facts for GOLD", async () => {
    const v = present(await load("GOLD"));
    expect(v.summary.map((t) => t.label)).toEqual(["Typical price", "Spread", "Best way in", "Tokens checked"]);
    expect(v.summary[0]).toMatchObject({ value: v.instrument.reference.price, note: "per troy ounce" });
    expect(v.summary[1].value).toMatch(/^\d+\.\d\d%$/);
    expect(v.summary[2].value).toBe("XAUt");
    expect(v.summary[3]).toEqual({ label: "Tokens checked", value: "7", note: "1 can't be held" });
  });

  it("says 'per share' for stocks and names the best token by its display name", async () => {
    const v = present(await load("NVDA"));
    expect(v.summary[0].note).toBe("per share");
    expect(v.summary[2].value).not.toBe("None");
  });
});
