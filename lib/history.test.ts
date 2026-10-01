import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { check } from "./check";
import { clearCmcCache } from "./cmc";
import { fixtureClient } from "./data-source";
import { creditsLeft, dailyRow, FULL_HOUR_UTC, historyPath, mayRun, pickKind, priceRow } from "./history";
import { METHOD_VERSION } from "./verdict";

const T = "2026-10-01T12:00:00.000Z";
const watchlist = JSON.parse(readFileSync(join(process.cwd(), "scripts/watchlist.json"), "utf8")) as { symbol: string; rwa_id: number }[];

beforeEach(() => clearCmcCache());

async function full(symbol: string) {
  const r = await check(symbol, fixtureClient());
  if (r.kind !== "ok") throw new Error(symbol);
  return r.result;
}

describe("hourly price rows", () => {
  it("convert per-gram tokens, record spot, and agree with the full check", async () => {
    const c = fixtureClient();
    const q = await c.rwaQuotesLatest(1);
    if (!q.ok || !q.data) throw new Error("GOLD quotes");
    const s = await c.metalSpot("XAU", q.data.last_updated);
    if (!s.ok) throw new Error("GOLD spot");
    const row = priceRow(q.data, T, { code: "XAU", ...s.data });
    expect(row).toMatchObject({ t: T, kind: "prices", symbol: "GOLD", rwa_id: 1 });
    expect(row.tokens.filter((x) => x.unit === "per_gram_to_oz")).toHaveLength(2);
    const cgo = row.tokens.find((x) => x.token === "CGO")!;
    expect(cgo.price).toBeGreaterThan(4000); // per ounce, not ~$137 per gram
    const f = await full("GOLD");
    expect(row.typical_price).toBe(Math.round(f.reference.consensus_usd! * 100) / 100);
    expect(row.spot).toBe(4285.41);
    expect(row.tokens.find((x) => x.token === "XAUt")!.premium_pct).toBe(Math.round(f.wrappers.find((w) => w.display === "XAUt")!.premium_pct! * 100) / 100);
  });

  it("works for every watched asset, and the watchlist ids are the assets they claim", async () => {
    for (const a of watchlist) {
      const q = await fixtureClient().rwaQuotesLatest(a.rwa_id);
      if (!q.ok || !q.data) throw new Error(a.symbol);
      expect(priceRow(q.data, T).symbol).toBe(a.symbol);
    }
  });
});

describe("daily full rows", () => {
  it("record verdict, answer, method version and per-token exit", async () => {
    const row = dailyRow(await full("UNH"), T);
    expect(row).toMatchObject({ kind: "full", symbol: "UNH", verdict: "RICH", answer: "best way in · UNHon", method_version: METHOD_VERSION });
    expect(row.tokens.find((x) => x.token === "UNHon")).toMatchObject({ verdict: "RICH", premium_pct: 1.51 });
    expect(JSON.stringify(row)).not.toMatch(/NaN|undefined/);
  });
});

describe("paths and the credit guard", () => {
  it("writes one file per asset per month", () => {
    expect(historyPath("prices", "GOLD", T)).toBe("prices/GOLD/2026-10.jsonl");
    expect(historyPath("daily", "BRK.B", T)).toBe("daily/BRK.B/2026-10.jsonl");
  });

  it("reads credits left from /v1/key/info", () => {
    const info = JSON.parse(readFileSync(join(process.cwd(), "fixtures/v1_key_info.json"), "utf8"));
    expect(creditsLeft(info.body ?? info)).toBeGreaterThan(0);
    expect(creditsLeft({})).toBeNull();
  });

  it("adapts to the plan: hourly full checks on a big plan, prices plus one daily full on 15k", () => {
    expect(pickKind(450_000, 14)).toBe("full");
    expect(pickKind(15_000, 14)).toBe("prices");
    expect(pickKind(15_000, FULL_HOUR_UTC)).toBe("full");
    expect(pickKind(null, 14)).toBe("prices"); // unknown plan: the cheap option
  });

  it("keeps the reserve for the live site", () => {
    expect(mayRun(10_000, 9, 4_000).ok).toBe(true);
    expect(mayRun(4_005, 9, 4_000)).toMatchObject({ ok: false });
    expect(mayRun(null, 9, 4_000)).toMatchObject({ ok: false, why: expect.stringMatching(/couldn't read/) });
  });
});
