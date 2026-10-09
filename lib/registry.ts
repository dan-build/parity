/**
 * The open registry: what each token actually represents, one JSON file per asset in
 * registry/<SYMBOL>.json. It's the data CoinMarketCap doesn't have (units, share ratios,
 * redemption terms, who can hold it), maintained by pull request.
 *
 * Every fact says where it came from (`source`). Unknown stays null; it's never guessed.
 * The engine reads units from here first and falls back to price inference (METHOD.md §4).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { TokenUnit } from "./verdict";

export type { TokenUnit };

export const REGISTRY_DIR = join(process.cwd(), "registry");

/** How a fact got into the registry. */
export type Source = "issuer" | "community" | "inferred-from-price" | "cmc";

/**
 * How a holder gets the real asset: `issuer_kyc` = redeem with the issuer after its KYC
 * onboarding; `issuer` = redeem through the issuer (its own terms apply); `none` = can't be
 * redeemed for the asset at all (e.g. a derivative contract).
 */
export type RedemptionRoute = "issuer_kyc" | "issuer" | "none";

export type RegistryToken = {
  crypto_id: number;
  symbol: string | null;
  issuer: string | null;
  /** null = not confirmed yet; `unit_note` says why. */
  unit: TokenUnit | null;
  unit_note?: string;
  contracts: { chain: string; address: string; source: Source }[];
  /** Unknown until an issuer or contributor fills them in, with a link. */
  redemption: { route: RedemptionRoute; summary: string; url: string; source: Source } | null;
  eligibility: { summary: string; url: string; source: Source } | null;
  attestations: { url: string; source: Source }[];
  verified_by_issuer: boolean;
};

export type RegistryAsset = {
  asset: { symbol: string; rwa_id: number; name: string; type: string; reference: "troy_ounce" | "share" };
  tokens: RegistryToken[];
  updated: string;
};

/** registry/<SYMBOL>.json for this asset, if it exists and is the same rwa_id. */
export function loadRegistry(symbol: string, rwaId: number, dir = REGISTRY_DIR): RegistryAsset | null {
  const file = join(dir, `${symbol.toUpperCase().replace(/[^A-Z0-9._-]/g, "_")}.json`);
  if (!existsSync(file)) return null;
  const r = JSON.parse(readFileSync(file, "utf8")) as RegistryAsset;
  return r.asset.rwa_id === rwaId ? r : null;
}

export function listRegistry(dir = REGISTRY_DIR): RegistryAsset[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as RegistryAsset);
}
