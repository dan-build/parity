/**
 * "Your size": roughly what it costs to get in and out of a token for a given amount, from
 * data Parity already has. Pure; nothing here is fetched. METHOD.md §12 ("Cost at your size").
 *
 * - The cost of a round trip: price impact buying `size` dollars, plus price impact selling
 *   the same amount later, at today's depth. The premium isn't added: it's shown on its own
 *   (the "vs spot"/"vs typical" column), and you usually sell back at a premium too, so only a
 *   change in it would cost you. premium_usd is returned for context.
 * - Price impact uses the standard pool formula: in a pool with depth L (both sides, in USD),
 *   the dollar side holds about L/2, and trading S dollars moves the average price by S/(L/2).
 *   L is the token's tradable depth: pools paired with dollars or a major coin.
 *
 * It's an estimate, and says what it leaves out: pool fees and gas (not in CoinMarketCap's
 * data), concentrated liquidity (can be better or worse than an even pool), and centralised
 * venues (CoinMarketCap doesn't give their order books). Unknown depth → no estimate, never a guess.
 */
import type { WrapperResult } from "./verdict";

/** Amounts the page offers, in USD. */
export const SIZES = [1_000, 10_000, 100_000] as const;
export const DEFAULT_SIZE = 10_000;
/** Above this average impact per leg, the pools are too shallow for the estimate to mean much. */
export const MAX_IMPACT = 0.25;

export type SizeCost =
  | {
      kind: "estimate";
      size_usd: number;
      /** The premium at this size, for context only (negative = a discount). Not in total_usd. */
      premium_usd: number;
      /** Average price impact per leg, as a fraction (0.004 = 0.4%). */
      impact: number;
      in_usd: number;
      out_usd: number;
      total_usd: number;
      /** total_usd as a % of size. */
      total_pct: number;
      depth_usd: number;
    }
  | { kind: "too_big"; size_usd: number; depth_usd: number }
  | { kind: "unknown"; size_usd: number; reason: "pools_not_checked" | "no_tradable_depth" | "no_price" };

/** Parse ?size=: one of SIZES, else the default. */
export function sizeFrom(raw: string | null | undefined): number {
  const n = Number(raw);
  return (SIZES as readonly number[]).includes(n) ? n : DEFAULT_SIZE;
}

export function sizeCost(w: Pick<WrapperResult, "premium_pct" | "dex">, size: number): SizeCost {
  if (w.premium_pct === null) return { kind: "unknown", size_usd: size, reason: "no_price" };
  if (!w.dex.checked) return { kind: "unknown", size_usd: size, reason: "pools_not_checked" };
  const depth = w.dex.tradable_liquidity_usd;
  if (!depth || depth <= 0) return { kind: "unknown", size_usd: size, reason: "no_tradable_depth" };
  const impact = size / (depth / 2);
  if (impact > MAX_IMPACT) return { kind: "too_big", size_usd: size, depth_usd: depth };
  const premium_usd = (size * w.premium_pct) / 100;
  const in_usd = impact * size;
  const out_usd = impact * size;
  const total_usd = in_usd + out_usd;
  return { kind: "estimate", size_usd: size, premium_usd, impact, in_usd, out_usd, total_usd, total_pct: (total_usd / size) * 100, depth_usd: depth };
}
