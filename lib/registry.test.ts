import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { clearCmcCache } from "./cmc";
import { fixtureClient } from "./data-source";
import { listRegistry, loadRegistry } from "./registry";
import { runCheck } from "./run-check";
import { OFF_TRACK_PCT } from "./verdict";

const source = z.enum(["issuer", "community", "inferred-from-price", "cmc"]);
const link = z.object({ summary: z.string().min(1), url: z.string().url(), source }).strict();
const schema = z
  .object({
    asset: z.object({ symbol: z.string(), rwa_id: z.number().int(), name: z.string(), type: z.string(), reference: z.enum(["troy_ounce", "share"]) }).strict(),
    tokens: z.array(
      z
        .object({
          crypto_id: z.number().int(),
          symbol: z.string().nullable(),
          issuer: z.string().nullable(),
          unit: z.object({ measure: z.enum(["troy_ounce", "gram", "share"]), per_token: z.number().positive(), source }).strict().nullable(),
          unit_note: z.string().min(1).optional(),
          contracts: z.array(z.object({ chain: z.string().min(1), address: z.string().min(1), source }).strict()),
          redemption: link.nullable(),
          eligibility: link.nullable(),
          attestations: z.array(z.object({ url: z.string().url(), source }).strict()),
          verified_by_issuer: z.boolean(),
        })
        .strict()
        .refine((t) => t.unit !== null || !!t.unit_note, "a token without a unit must say why (unit_note)"),
    ),
    updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

const registry = listRegistry();
const watchlist = JSON.parse(readFileSync(join(process.cwd(), "scripts/watchlist.json"), "utf8")) as { symbol: string; rwa_id: number }[];

beforeEach(() => clearCmcCache());

describe("the registry", () => {
  it("covers every watched asset", () => {
    expect(registry.map((r) => r.asset.symbol).sort()).toEqual(watchlist.map((w) => w.symbol).sort());
  });

  it.each(registry.map((r) => [r.asset.symbol, r] as const))("%s matches the schema", (_s, r) => {
    const res = schema.safeParse(r);
    expect(res.success ? [] : res.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)).toEqual([]);
    expect(new Set(r.tokens.map((t) => t.crypto_id)).size).toBe(r.tokens.length); // no duplicates
  });

  it.each(registry.map((r) => [r.asset.symbol, r] as const))("%s lists only tokens CoinMarketCap lists for that asset", async (_s, r) => {
    const q = await fixtureClient().rwaQuotesLatest(r.asset.rwa_id);
    if (!q.ok || !q.data) throw new Error("quotes");
    const ids = new Set(q.data.tokens.map((t) => t.crypto_id));
    expect(r.tokens.filter((t) => !ids.has(t.crypto_id)).map((t) => t.symbol)).toEqual([]);
    expect(q.data.symbol).toBe(r.asset.symbol);
  });

  // The eval that would have caught per-gram gold and KLAC: a recorded unit must make the
  // token's price agree with the reference (spot for metals, the tokens' consensus for stocks).
  it.each(registry.map((r) => [r.asset.symbol, r] as const))("%s units agree with observed prices", async (symbol) => {
    const { body } = await runCheck(symbol, "fixture");
    if (!body.ok) throw new Error(body.message);
    const off = body.wrappers
      .filter((w) => w.unit_source === "registry" && w.premium_pct !== null && Math.abs(w.premium_pct) > OFF_TRACK_PCT)
      .map((w) => `${w.display}: ${w.premium_pct?.toFixed(1)}% off with the registry's unit`);
    expect(off).toEqual([]);
  });

  it("is used by the engine, and says which file", async () => {
    const { body } = await runCheck("GOLD", "fixture");
    if (!body.ok) throw new Error(body.message);
    expect(body.registry).toEqual({ file: "registry/GOLD.json", tokens: 6, units: 6 });
    expect(body.wrappers.find((w) => w.symbol === "CGO")).toMatchObject({ unit: "per_gram_to_oz", unit_source: "registry" });
  });

  it("ignores a registry file for a different rwa_id", () => {
    expect(loadRegistry("GOLD", 999)).toBeNull();
  });
});

describe("docs quote the registry's real coverage", () => {
  it("registry/README.md and ROADMAP.md state the same 'N of M tokens have redemption terms' as the files", () => {
    const tokens = registry.flatMap((r) => r.tokens);
    const claim = `${tokens.filter((t) => t.redemption).length} of ${tokens.length} tokens have redemption terms`;
    for (const doc of ["registry/README.md", "ROADMAP.md"]) {
      expect(readFileSync(join(process.cwd(), doc), "utf8")).toContain(claim);
    }
  });

  it("never says 'buy' (Parity's rule holds for registry text too)", () => {
    const text = registry.flatMap((r) => r.tokens.flatMap((t) => [t.redemption?.summary, t.eligibility?.summary, t.unit_note])).filter(Boolean).join(" ");
    expect(text).not.toMatch(/\bbuy/i);
  });

  it("README, METHOD.md and ROADMAP.md state the same 'N of M tokens have a unit' as the files", () => {
    const tokens = registry.flatMap((r) => r.tokens);
    const claim = `${tokens.filter((t) => t.unit).length} of ${tokens.length}`;
    for (const doc of ["README.md", "METHOD.md", "ROADMAP.md"]) {
      expect(readFileSync(join(process.cwd(), doc), "utf8")).toContain(claim);
    }
  });
});
