import { describe, expect, it } from "vitest";
import { gatherInputs } from "./check";
import { clearCmcCache, createCmcClient } from "./cmc";
import { fixtureTransport } from "./cmc-fixtures";
import { GRAMS_PER_TROY_OUNCE, OFF_TRACK_PCT, THIN_BELOW, verdict, type VerdictInput, type VerdictResult } from "./verdict";

const GOLD = 1;
const NVDA = 2;
// crypto_ids from fixtures
const PAXG = 4705;
const XAUT = 5176;
const CGO = 20245; // priced per gram
const VNXAU = 22492; // priced per gram
const XAU_DERIV = 39344; // "NA (Derivatives)"
const NVDA_DERIV = 38153; // symbol "NVDA", "NA (Derivatives)"
const NVDA_ROBINHOOD = 40685; // symbol "NVDA", Robinhood
const NVDA_DINARI = 28616; // null price
const NVDAX = 36992;

async function load(rwaId: number): Promise<VerdictInput> {
  clearCmcCache();
  const r = await gatherInputs(rwaId, createCmcClient({ transport: fixtureTransport("fixtures"), source: "fixture" }));
  if (!r.ok) throw new Error(r.message);
  return r.input;
}

const byId = (r: VerdictResult, id: number) => {
  const w = r.wrappers.find((x) => x.crypto_id === id);
  if (!w) throw new Error(`wrapper ${id} missing`);
  return w;
};

/** Copy of the input with one token's fields overridden. */
function withToken(input: VerdictInput, id: number, patch: Partial<VerdictInput["tokens"][number]>): VerdictInput {
  return { ...input, tokens: input.tokens.map((t) => (t.crypto_id === id ? { ...t, ...patch } : t)) };
}

describe("per-gram gold", () => {
  it("detects CGO and VNXAU as per-gram and converts them to per-ounce", async () => {
    const r = verdict(await load(GOLD));
    for (const id of [CGO, VNXAU]) {
      const w = byId(r, id);
      expect(w.unit).toBe("per_gram_to_oz");
      expect(w.price_raw).toBeLessThan(200);
      expect(w.price_usd).toBeCloseTo((w.price_raw as number) * GRAMS_PER_TROY_OUNCE, 6);
      expect(Math.abs(w.premium_pct as number)).toBeLessThan(OFF_TRACK_PCT); // tracks gold once converted (raw: about −97%)
      expect(w.verdict).not.toBe("GHOST");
      expect(w.verdict).not.toBe("RICH");
      expect(w.reasons[0]).toMatch(/per gram/);
    }
  });

  it("leaves ounce-priced wrappers alone", async () => {
    const r = verdict(await load(GOLD));
    expect(byId(r, PAXG).unit).toBe("as_quoted");
    expect(byId(r, XAUT).unit).toBe("as_quoted");
  });

  it("without normalisation the per-gram tokens would look ~97% cheap and be thrown out", async () => {
    const input = await load(GOLD);
    const r = verdict({ ...input, asset: { ...input.asset, asset_type: "stock" } });
    expect(byId(r, CGO).verdict).toBe("GHOST");
    expect(byId(r, CGO).premium_pct).toBeLessThan(-90);
  });

  it("mentions the conversion in the headline reasons", async () => {
    const r = verdict(await load(GOLD));
    expect(r.reasons.some((s) => /per gram/.test(s))).toBe(true);
  });
});

describe("per-gram silver (few wrappers, consensus not median)", () => {
  it("anchors on the price most wrappers agree on and converts GRAMS", async () => {
    const r = verdict(await load(5));
    const grams = r.wrappers.find((w) => w.symbol === "GRAMS")!;
    const xagx = r.wrappers.find((w) => w.symbol === "XAGX")!;
    const kag = r.wrappers.find((w) => w.symbol === "KAG")!;
    expect(grams.unit).toBe("per_gram_to_oz");
    expect(Math.abs(grams.premium_pct as number)).toBeLessThan(1);
    expect(Math.abs(xagx.premium_pct as number)).toBeLessThan(1);
    expect(kag.verdict).toBe("GHOST"); // ~48% below the other two
  });

  it("never prints a null symbol", async () => {
    const r = verdict(await load(5));
    for (const w of r.wrappers) expect(w.display).not.toMatch(/^null|undefined/);
  });
});

describe("duplicate NVDA symbol", () => {
  it("keeps both NVDA wrappers, keyed by crypto_id, with different verdicts", async () => {
    const r = verdict(await load(NVDA));
    const nvdas = r.wrappers.filter((w) => w.symbol === "NVDA");
    expect(nvdas.map((w) => w.crypto_id).sort()).toEqual([NVDA_DERIV, NVDA_ROBINHOOD].sort());
    expect(byId(r, NVDA_DERIV).verdict).toBe("GHOST");
    expect(byId(r, NVDA_DERIV).reasons[0]).toMatch(/Derivatives/);
    expect(byId(r, NVDA_ROBINHOOD).verdict).not.toBe("GHOST");
  });

  it("every crypto_id appears exactly once", async () => {
    const r = verdict(await load(NVDA));
    const ids = r.wrappers.map((w) => w.crypto_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names colliding wrappers by symbol + issuer in all copy", async () => {
    const r = verdict(await load(NVDA));
    expect(byId(r, NVDA_ROBINHOOD).display).toBe("NVDA (Robinhood)");
    expect(byId(r, NVDAX).display).toBe("NVDAX");
    expect(byId(r, NVDA_ROBINHOOD).reasons.join(" ")).toContain("NVDA (Robinhood)");
    // Wrapper lists and per-wrapper gaps never use a bare, ambiguous "NVDA".
    const alsoFair = r.reasons.find((s) => s.startsWith("Also fair: "));
    const listed = alsoFair?.replace(/^Also fair: |\.$/g, "").split(", ") ?? [];
    expect(listed).toContain("NVDA (Robinhood)");
    expect(listed).not.toContain("NVDA");
    const wrapperGap = r.gaps.find((g) => g.crypto_id === NVDA_ROBINHOOD);
    expect(wrapperGap?.message.startsWith("NVDA (Robinhood):")).toBe(true);
  });
});

describe("GHOST", () => {
  it("marks derivative-issuer and null-price wrappers as GHOST", async () => {
    const gold = verdict(await load(GOLD));
    const nvda = verdict(await load(NVDA));
    expect(byId(gold, XAU_DERIV).verdict).toBe("GHOST");
    expect(byId(nvda, NVDA_DINARI).verdict).toBe("GHOST");
    expect(byId(nvda, NVDA_DINARI).reasons[0]).toMatch(/No live price/);
    expect(byId(nvda, NVDA_DINARI).exit_score).toBeNull();
  });

  it("excludes GHOSTs from the reference price", async () => {
    const input = await load(GOLD);
    const r = verdict(input);
    expect(r.reference.wrappers_used).toBe(r.wrappers.filter((w) => w.verdict !== "GHOST").length);
    // Moving a GHOST's price must not move the reference.
    const moved = verdict(withToken(input, XAU_DERIV, { price: 99_999 }));
    expect(moved.reference.price_usd).toBe(r.reference.price_usd);
  });

  it("a price far off the others is GHOST (doesn't track the asset)", async () => {
    const input = await load(GOLD);
    const paxg = input.tokens.find((t) => t.crypto_id === PAXG)!;
    const r = verdict(withToken(input, PAXG, { price: (paxg.price as number) * 1.1 }));
    expect(byId(r, PAXG).verdict).toBe("GHOST");
    expect(byId(r, PAXG).reasons.join(" ")).toMatch(/doesn't track/);
  });

  it("all-GHOST asset → GHOST headline with no wrapper", async () => {
    const input = await load(NVDA);
    const r = verdict({ ...input, tokens: input.tokens.map((t) => ({ ...t, issuer_name: "NA (Derivatives)" })) });
    expect(r.verdict).toBe("GHOST");
    expect(r.headline_crypto_id).toBeNull();
    expect(r.reasons.length).toBeGreaterThanOrEqual(3);
  });
});

describe("RICH and THIN", () => {
  it("a wrapper 3% above the others is RICH", async () => {
    const input = await load(GOLD);
    const paxg = input.tokens.find((t) => t.crypto_id === PAXG)!;
    const r = verdict(withToken(input, PAXG, { price: (paxg.price as number) * 1.03 }));
    const w = byId(r, PAXG);
    expect(w.verdict).toBe("RICH");
    expect(w.premium_pct).toBeGreaterThan(2.5);
    expect(w.reasons.join(" ")).toMatch(/more than the typical GOLD token/);
    expect(r.verdict).toBe("FAIR"); // headline moves to a FAIR wrapper
    expect(r.headline_crypto_id).not.toBe(PAXG);
  });

  it("low volume + no pool depth is THIN", async () => {
    const r = verdict(await load(GOLD));
    const v = byId(r, VNXAU); // ~$2k/day volume, ~$72 in pools
    expect(v.verdict).toBe("THIN");
    expect(v.exit_score as number).toBeLessThan(THIN_BELOW);
  });

  it("the same wrapper with volume and depth removed becomes THIN", async () => {
    const input = await load(GOLD);
    const pools = new Map(input.pools);
    pools.set(PAXG, { checked: true, pools: [] });
    const r = verdict({ ...withToken(input, PAXG, { volume_24h: 500 }), pools });
    expect(byId(r, PAXG).verdict).toBe("THIN");
  });
});

describe("headline", () => {
  it("picks the FAIR wrapper with the best exit score and gives 3–6 plain reasons", async () => {
    for (const id of [GOLD, NVDA]) {
      const r = verdict(await load(id));
      const best = byId(r, r.headline_crypto_id as number);
      expect(r.verdict).toBe("FAIR");
      expect(best.verdict).toBe("FAIR");
      const maxFairExit = Math.max(...r.wrappers.filter((w) => w.verdict === "FAIR").map((w) => w.exit_score ?? 0));
      expect(best.exit_score).toBe(maxFairExit);
      expect(r.reasons.length).toBeGreaterThanOrEqual(3);
      expect(r.reasons.length).toBeLessThanOrEqual(6);
      expect(r.reasons.join(" ")).not.toMatch(/bps|basis point/i);
    }
  });
});

describe("missing liqUsd", () => {
  it("counts pools without liqUsd as missing, not zero, and reports a gap", async () => {
    const input = await load(NVDA);
    const r = verdict(input);
    const w = byId(r, NVDAX);
    const lookup = input.pools.get(NVDAX);
    if (!lookup?.checked) throw new Error("NVDAX pools should be in fixtures");
    const present = lookup.pools.filter((p) => p.liquidity_usd !== null);
    expect(w.dex.pools_missing_liquidity).toBe(lookup.pools.length - present.length);
    expect(w.dex.pools_missing_liquidity).toBeGreaterThan(0);
    expect(w.dex.liquidity_usd).toBeCloseTo(present.reduce((s, p) => s + (p.liquidity_usd as number), 0), 6);
    expect(r.gaps.some((g) => g.code === "pool_liquidity_missing" && g.crypto_id === NVDAX)).toBe(true);
  });
});

describe("purity", () => {
  it("doesn't mutate its input", async () => {
    const input = await load(GOLD);
    const snapshot = structuredClone(input);
    verdict(input);
    expect(input).toEqual(snapshot);
  });
});
