/**
 * Where CMC data comes from. Server-side only.
 *
 * PARITY_DATA_MODE=fixture (default) replays fixtures/ and spends no credits.
 * PARITY_DATA_MODE=live calls CoinMarketCap with CMC_API_KEY. With no key, or when CMC
 * rate-limits or fails, answers fall back to fixtures (see lib/run-check.ts).
 */
import { join } from "node:path";
import { createCmcClient, liveTransport, type CmcClient } from "./cmc";
import { fixtureTransport } from "./cmc-fixtures";

export type DataMode = "fixture" | "live";

/** Why a live request was answered from saved data instead. */
export type Fallback = "no_key" | "rate_limited" | "unavailable";

export type DataSource = { client: CmcClient; mode: DataMode; fallback: Fallback | null };

export function dataMode(): DataMode {
  return process.env.PARITY_DATA_MODE === "live" ? "live" : "fixture";
}

export function fixtureClient(): CmcClient {
  return createCmcClient({ transport: fixtureTransport(join(process.cwd(), "fixtures")), source: "fixture" });
}

/** Live when asked for and a key is set; otherwise saved data (never an error). */
export function createClient(force?: DataMode): DataSource {
  const mode = force ?? dataMode();
  if (mode === "fixture") return { mode, client: fixtureClient(), fallback: null };
  const key = process.env.CMC_API_KEY;
  if (!key) return { mode: "fixture", client: fixtureClient(), fallback: "no_key" };
  return { mode, client: createCmcClient({ transport: liveTransport(key), source: "live" }), fallback: null };
}
