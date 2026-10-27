/**
 * Seed registry/<SYMBOL>.json for the watched assets from saved CoinMarketCap data
 * (fixtures/, 0 credits). Only adds tokens that aren't in the file yet: anything a person
 * has edited is left alone.
 *
 * What it can know: contracts (CMC) and units where a token's price agrees with the others
 * or with spot (inferred-from-price). What it can't: redemption, eligibility, attestations,
 * and units for tokens whose price disagrees. Those stay null for issuers and contributors.
 *
 *   npm run registry:seed
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { metalFor } from "../lib/check";
import { pct } from "../lib/present";
import { REGISTRY_DIR, type RegistryAsset, type RegistryToken } from "../lib/registry";
import { runCheck } from "../lib/run-check";

const watchlist = JSON.parse(readFileSync(join(process.cwd(), "scripts/watchlist.json"), "utf8")) as { symbol: string }[];
const today = new Date().toISOString().slice(0, 10);

async function main() {
  mkdirSync(REGISTRY_DIR, { recursive: true });
  for (const { symbol } of watchlist) {
    const { body } = await runCheck(symbol, "fixture");
    if (!body.ok) throw new Error(`${symbol}: ${body.message}`);
    const metal = !!metalFor(body.asset);
    const file = join(REGISTRY_DIR, `${symbol}.json`);
    const existing: RegistryAsset | null = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
    const known = new Set(existing?.tokens.map((t) => t.crypto_id));

    const added: RegistryToken[] = body.wrappers
      .filter((w) => !/derivative/i.test(w.issuer_name ?? "")) // price feeds aren't tokens
      .filter((w) => !known.has(w.crypto_id))
      .map((w) => {
        const live = w.verdict !== "GHOST";
        let unit: RegistryToken["unit"] = null;
        let unit_note: string | undefined;
        if (live && w.unit === "per_gram_to_oz") unit = { measure: "gram", per_token: 1, source: "inferred-from-price" };
        else if (live) unit = { measure: metal ? "troy_ounce" : "share", per_token: 1, source: "inferred-from-price" };
        else if (w.price_raw === null) unit_note = "No live price to infer a unit from.";
        else unit_note = `Price is ${pct(w.premium_pct ?? 0, 0)} from the reference, so its unit or ratio can't be inferred. Needs a source.`;
        return {
          crypto_id: w.crypto_id,
          symbol: w.symbol === "Unnamed listing" ? null : w.symbol,
          issuer: w.issuer_name,
          unit,
          ...(unit_note ? { unit_note } : {}),
          contracts: w.chain && w.contract ? [{ chain: w.chain, address: w.contract, source: "cmc" as const }] : [],
          redemption: null,
          eligibility: null,
          attestations: [],
          verified_by_issuer: false,
        };
      });

    const out: RegistryAsset = {
      asset: {
        symbol: body.asset.symbol,
        rwa_id: body.asset.rwa_id,
        name: body.asset.name,
        type: body.asset.asset_type,
        reference: metal ? "troy_ounce" : "share",
      },
      tokens: [...(existing?.tokens ?? []), ...added],
      updated: added.length || !existing ? today : existing.updated,
    };
    writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
    console.log(`${symbol.padEnd(7)} ${added.length} added, ${known.size} kept · units confirmed for ${out.tokens.filter((t) => t.unit).length}/${out.tokens.length}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
