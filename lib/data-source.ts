/**
 * Where CMC data comes from. Server-side only.
 *
 * PARITY_DATA_MODE=fixture (default) replays fixtures/ and spends no credits.
 * PARITY_DATA_MODE=live calls CoinMarketCap with CMC_API_KEY.
 */
import { join } from "node:path";
import { createCmcClient, liveTransport, type CmcClient } from "./cmc";
import { fixtureTransport } from "./cmc-fixtures";

export type DataMode = "fixture" | "live";

export function dataMode(): DataMode {
  return process.env.PARITY_DATA_MODE === "live" ? "live" : "fixture";
}

export function createClient(force?: DataMode): { client: CmcClient; mode: DataMode } | { error: string } {
  const mode = force ?? dataMode();
  if (mode === "fixture") {
    return { mode, client: createCmcClient({ transport: fixtureTransport(join(process.cwd(), "fixtures")), source: "fixture" }) };
  }
  const key = process.env.CMC_API_KEY;
  if (!key) return { error: "PARITY_DATA_MODE is live but CMC_API_KEY isn't set on the server." };
  return { mode, client: createCmcClient({ transport: liveTransport(key), source: "live" }) };
}
