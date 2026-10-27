/**
 * Where CMC data comes from. Server-side only.
 *
 * PARITY_DATA_MODE=fixture (default) replays fixtures/ and spends no credits.
 * PARITY_DATA_MODE=live calls CoinMarketCap with CMC_API_KEY. With no key, or when CMC
 * rate-limits or fails, answers fall back to fixtures (see lib/run-check.ts).
 */
import { join } from "node:path";
import { createCmcClient, liveTransport, type CmcClient, type Transport } from "./cmc";
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

/**
 * At most this many live CoinMarketCap calls per minute per server instance, for everyone
 * together: a ceiling on spend that no client can raise, and below CMC's own 50/min limit.
 * Past it, calls get a synthetic rate-limit answer, so checks fall back to saved data with a
 * notice (lib/run-check.ts). Not shared across instances: a global budget needs shared storage.
 */
export const LIVE_CALLS_PER_MINUTE = 40;

export function budgeted(inner: Transport, perMinute = LIVE_CALLS_PER_MINUTE, now: () => number = Date.now): Transport {
  const calls: number[] = [];
  return async (req) => {
    const t = now();
    while (calls.length && t - calls[0] >= 60_000) calls.shift();
    if (calls.length >= perMinute) {
      return { status: 429, body: { status: { error_code: "1008", error_message: "Parity's own per-minute budget for live calls is used up." } } };
    }
    calls.push(t);
    return inner(req);
  };
}

/** One budget per server instance, shared by every live client it creates. */
let instanceBudget: { key: string; transport: Transport } | null = null;

/** Live when asked for and a key is set; otherwise saved data (never an error). */
export function createClient(force?: DataMode): DataSource {
  const mode = force ?? dataMode();
  if (mode === "fixture") return { mode, client: fixtureClient(), fallback: null };
  const key = process.env.CMC_API_KEY;
  if (!key) return { mode: "fixture", client: fixtureClient(), fallback: "no_key" };
  if (instanceBudget?.key !== key) instanceBudget = { key, transport: budgeted(liveTransport(key)) };
  return { mode, client: createCmcClient({ transport: instanceBudget.transport, source: "live" }), fallback: null };
}
