import { beforeEach, describe, expect, it } from "vitest";
import { clearCmcCache } from "./cmc";
import { logLines, logSummary } from "./log";
import { coinTooltip, exitMeter, moneyShort, pct, present, recommended, usMarketClosedAt, type CheckResponse } from "./present";
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
    // The needle is CMC's gold spot price at the time of the quotes (method 1.1.0).
    expect(v.instrument.reference).toMatchObject({ label: "Gold spot", price: "$4,285.41", vs: "vs spot price" });
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
    expect(v.summary.map((t) => t.label)).toEqual(["Spot price", "Price spread", "Traded, 24h", "Tokens checked"]);
    expect(v.summary[0]).toMatchObject({ value: v.instrument.reference.price, note: "per troy ounce" });
    expect(v.summary[1].value).toMatch(/^\d+\.\d\d%$/);
    expect(v.summary[2]).toMatchObject({ value: expect.stringMatching(/^\$\d/), note: expect.stringMatching(/^\d+% in XAUt$/) });
    expect(v.summary[3]).toEqual({ label: "Tokens checked", value: "7", note: "1 can't be held" });
  });

  it("says 'per share' for stocks, which keep the tokens' typical price", async () => {
    const v = present(await load("NVDA"));
    expect(v.summary[0]).toMatchObject({ label: "Typical price", note: "per share" });
    expect(v.instrument.reference.vs).toBe("vs typical price");
  });

  it("says plainly when nothing traded", async () => {
    // SILVER's only trading token is KAG, which doesn't track silver: the tile counts it, the reasons say why it doesn't help.
    expect(present(await load("SILVER")).summary[2]).toEqual({ label: "Traded, 24h", value: "$119k", note: "100% in KAG" });
  });

  it("never tells anyone to buy", async () => {
    for (const q of ["GOLD", "NVDA", "SPY", "TSLA", "AAPL", "SILVER"]) {
      const v = present(await load(q));
      const copy = [v.headline.sub, v.route?.line, ...v.reasons.map((r) => r.strong + r.rest), ...v.summary.map((t) => t.note)].join(" ");
      expect(copy).not.toMatch(/\bbuy\b/i);
    }
  });
});

describe("best way in", () => {
  it("marks exactly one row and names it unambiguously when symbols collide", async () => {
    for (const q of ["GOLD", "NVDA"]) {
      const v = present(await load(q));
      const best = v.list.rows.filter((r) => r.best);
      expect(best).toHaveLength(1);
      expect(best[0].ticker).toBe(v.route?.ticker);
      const sameSymbol = v.list.rows.filter((r) => r.ticker === v.route?.ticker).length;
      if (sameSymbol > 1) expect(v.route?.display).not.toBe(v.route?.ticker);
    }
  });
});

describe("no easy way out (the best-ranked token has no 24h volume)", () => {
  it("recommends nothing for SILVER, and says why everywhere", async () => {
    const r = await load("SILVER");
    const top = r.wrappers.find((w) => w.crypto_id === r.headline_crypto_id)!;
    expect(top.volume_24h ?? 0).toBe(0); // the fixture this rule exists for
    const v = present(r);
    expect(v.route).toBeNull();
    expect(v.noEasyExit).toBe(true);
    expect(v.list.rows.some((row) => row.best)).toBe(false);
    expect(v.reasons[0]).toMatchObject({ strong: "No token that tracks silver traded in the last day." });
    expect(v.reasons.some((x) => /easiest to sell/.test(x.strong))).toBe(false);
    expect(logSummary(r).verdictLine).toBe("Thin · no easy way out");
  });

  it("still recommends the headline token when it trades", async () => {
    const v = present(await load("GOLD"));
    expect(v.noEasyExit).toBe(false);
    expect(v.route?.display).toBe("XAUt");
  });

  it("applies to any asset: zero volume on the top token means no route", async () => {
    const r = await load("GOLD");
    const dry = { ...r, wrappers: r.wrappers.map((w) => (w.crypto_id === r.headline_crypto_id ? { ...w, volume_24h: 0 } : w)) };
    const v = present(dry);
    expect(v.route).toBeNull();
    expect(v.noEasyExit).toBe(true);
    expect(recommended(dry)).toBeNull();
  });
});

describe("where the best way in lives", () => {
  it("names the chain and a short contract for GOLD's XAUt", async () => {
    const v = present(await load("GOLD"));
    expect(v.route?.where.map((w) => w.label)).toEqual(["chain", "contract"]);
    expect(v.route?.where[1].value).toMatch(/^0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4}$/);
  });
});

describe("claims the data must back", () => {
  it("only says 'whichever token you pick' when every token you could hold is fair", async () => {
    // TSLA's Hyperliquid token is off-track (about −19%) but can still be bought.
    expect(present(await load("TSLA")).headline.sub).toBe("if you pick the right token.");
  });

  it("counts off-track tokens apart from ones that can't be held", async () => {
    expect(present(await load("SILVER")).summary[3].note).toBe("2 can't be held, 1 doesn't track it");
  });

  it("calls the pick the most traded, not the deepest", async () => {
    const line = present(await load("GOLD")).route?.line ?? "";
    expect(line).toMatch(/most traded/);
    expect(line).not.toMatch(/deepest/);
  });

  it("keeps red for overpriced: an off-track price is grey", async () => {
    const kag = present(await load("SILVER")).list.rows.find((r) => r.ticker === "KAG")!;
    expect(kag.premium.tone).toBe("ghost");
    expect(kag.priceNote?.text).toBe("Doesn't track silver");
  });
});

describe("plain copy", () => {
  it("never shows a raw id: a token with no symbol or name is an unnamed listing", async () => {
    const v = present(await load("SILVER"));
    expect(v.list.rows.some((r) => r.ticker.startsWith("#"))).toBe(false);
    expect(v.list.rows.find((r) => r.id === 39318)?.ticker).toBe("Unnamed listing");
  });

  it("says when replayed data was saved instead of how many hours ago", async () => {
    expect(present(await load("GOLD")).list.unitLine).toMatch(/^Per troy ounce, saved data from \d{1,2} [A-Z][a-z]{2} 20\d\d$/);
  });

  it("spells out credits and never says off-track", async () => {
    for (const q of ["GOLD", "NVDA", "SPY", "TSLA", "AAPL", "SILVER"]) {
      const r = await load(q);
      const v = present(r);
      const copy = JSON.stringify([v.reasons, v.instrument.ghostNote, v.list.rows, v.evidence.map((e) => e.meta), logLines(r), r.reasons]);
      expect(copy).not.toMatch(/off-track/i);
      expect(copy).not.toMatch(/\d cr\b/);
    }
  });
});

describe("all four verdicts have a saved demo", () => {
  it.each([
    ["GOLD", "FAIR"],
    ["SILVER", "THIN"],
    ["UNH", "RICH"],
    ["KLAC", "GHOST"],
    ["MS", "GHOST"],
  ])("%s → %s", async (q, verdict) => {
    expect((await load(q)).verdict).toBe(verdict);
  });

  it("UNH: the only liquid token costs extra, and the page says so", async () => {
    const v = present(await load("UNH"));
    expect(v.headline.sub).toBe("even the best token costs extra.");
    expect(v.route?.display).toBe("UNHon");
    expect(v.list.rows.find((r) => r.ticker === "UNHon")?.premium.tone).toBe("rich");
  });

  it("GHOST copy tells apart 'nothing to hold' from 'tokens that disagree'", async () => {
    expect(present(await load("MS")).headline.sub).toBe("nothing here you can really hold.");
    expect(present(await load("KLAC")).headline.sub).toBe("the tokens don't agree on a price.");
  });
});

describe("KLAC: two tokens 10× apart", () => {
  it("shows no typical price and says there's no price to trust, in the chip and the toast", async () => {
    const r = await load("KLAC");
    const v = present(r);
    expect(v.summary[0].value).toBe("—");
    expect(v.instrument.reference.price).toBe("—");
    expect(v.headline.chip).toBe("no price to trust");
    expect(logSummary(r).verdictLine).toBe("Ghost · no price to trust");
  });

  it("MS has nothing to hold at all", async () => {
    expect(present(await load("MS")).headline.chip).toBe("nothing to hold");
  });
});

describe("US market hours (stocks)", () => {
  it("knows regular hours in New York time, across daylight saving", () => {
    expect(usMarketClosedAt("2026-09-25T14:00:00Z")).toBe(false); // Fri 10:00 EDT
    expect(usMarketClosedAt("2026-09-25T13:00:00Z")).toBe(true); // Fri 09:00 EDT, before the open
    expect(usMarketClosedAt("2026-09-25T20:00:00Z")).toBe(true); // Fri 16:00 EDT, at the close
    expect(usMarketClosedAt("2026-09-26T15:00:00Z")).toBe(true); // Saturday
    expect(usMarketClosedAt("2026-12-01T14:45:00Z")).toBe(false); // Tue 09:45 EST
    expect(usMarketClosedAt("2026-12-01T14:15:00Z")).toBe(true); // Tue 09:15 EST
  });

  it("tells stock buyers when quotes were taken with the market closed, and never metal buyers", async () => {
    const title = "Where the shares are trading now";
    expect(present(await load("NVDA")).gaps.some((g) => g.title === title)).toBe(true); // Fri 17:48 New York
    expect(present(await load("GOLD")).gaps.some((g) => g.title === title)).toBe(false);
  });
});

describe("coin tooltips", () => {
  const tip = (v: ReturnType<typeof present>, ticker: string) => v.instrument.coins.find((c) => c.ticker === ticker)?.tooltip;

  it("say the premium against the right reference: spot for metals, typical for stocks", async () => {
    expect(tip(present(await load("GOLD")), "XAUt")).toBe("XAUt · +0.03% vs spot");
    expect(tip(present(await load("NVDA")), "NVDAX")).toBe("NVDAX · +0.06% vs typical");
  });

  it("explain a converted unit", async () => {
    expect(tip(present(await load("GOLD")), "CGO")).toBe("CGO · −0.93% vs spot · priced per gram");
  });

  it("say why a ghost is a ghost", async () => {
    const gold = present(await load("GOLD"));
    expect(tip(gold, "XAU")).toBe("XAU · price feed, not a token");
    expect(tip(present(await load("NVDA")), "NVDA.D")).toBe("NVDA.D · no price");
    expect(tip(present(await load("SILVER")), "KAG")).toBe("KAG · −48% vs spot · doesn't track silver");
  });

  it("keep colliding symbols apart", async () => {
    const v = present(await load("NVDA"));
    const nvda = v.instrument.coins.filter((c) => c.ticker === "NVDA").map((c) => c.tooltip);
    expect(nvda).toHaveLength(2);
    expect(nvda.every((t) => /^NVDA \(/.test(t))).toBe(true);
  });

  it("explain a registry share ratio", async () => {
    const r = await load("KLAC");
    const klacx = r.wrappers.find((w) => w.symbol === "KLACx")!;
    const asRatio = { ...klacx, verdict: "FAIR" as const, unit: "per_token_ratio" as const, units_per_token: 0.1, premium_pct: -0.07 };
    expect(coinTooltip(asRatio, { isSpot: false, noun: "KLAC" })).toBe("KLACx · −0.07% vs typical · 1 token = 0.1 shares");
  });
});

describe("how a holder gets the real asset (METHOD.md §12)", () => {
  it("NVDA: Robinhood's token can't be redeemed for shares, xStocks' after KYC, each linked to the issuer's page", async () => {
    const rows = present(await load("NVDA")).list.rows;
    const by = (ticker: string, issuer: RegExp) => rows.find((r) => r.ticker === ticker && issuer.test(r.sub));
    expect(by("NVDA", /Robinhood/)?.redeem).toMatchObject({ text: "Can't be redeemed for shares", url: expect.stringMatching(/^https:\/\/robinhood\.com\//) });
    expect(by("NVDAX", /Backed/)?.redeem).toMatchObject({ text: "Redeemable with the issuer, after KYC", url: expect.stringMatching(/^https:\/\/docs\.xstocks\.fi\//) });
    expect(by("NVDAon", /Ondo/)?.redeem?.text).toBe("Redeemable with the issuer, after KYC");
    // The derivatives feed and Dinari have nothing on file: no line, not "no".
    expect(rows.filter((r) => !r.redeem).length).toBeGreaterThan(0);
  });

  it("GOLD: PAXG and XAUt redeem through the issuer; the hover says the issuer's own terms", async () => {
    const rows = present(await load("GOLD")).list.rows;
    expect(rows.find((r) => r.ticker === "PAXG")?.redeem?.text).toBe("Redeemable through the issuer");
    expect(rows.find((r) => r.ticker === "XAUt")?.redeem?.title).toMatch(/Switzerland.*\(from the issuer's page\)$/);
  });

  it("every line is backed by a registry fact and never says 'buy'", async () => {
    for (const q of ["GOLD", "NVDA", "SPY", "TSLA", "AAPL", "SILVER", "UNH", "MS", "KLAC"]) {
      const body = await load(q);
      for (const r of present(body).list.rows.filter((x) => x.redeem)) {
        expect(body.redemption.some((f) => f.crypto_id === r.id && f.url === r.redeem!.url)).toBe(true);
        expect(r.redeem!.text + r.redeem!.title).not.toMatch(/\bbuy/i);
      }
    }
  });
});
