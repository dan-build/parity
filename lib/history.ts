/**
 * History snapshots: one JSON line per asset per run, appended to monthly files in the
 * private, git-ignored history/ folder (scripts/snapshot.ts). Never published: CoinMarketCap's
 * terms don't allow making their data available to third parties.
 *
 * - prices (hourly, 1 credit per asset): quotes only, run through the real verdict()
 *   without pools, so units are converted and premiums match the site.
 * - full (daily, ~5–7 credits per asset): the complete check, with exit scores and verdicts.
 *
 * Only live data is ever recorded: a saved-data fallback is not history.
 * Pure: give it results, get rows.
 */
import type { CheckResult } from "./check";
import type { RwaQuote } from "./cmc";
import { answerLine } from "./present";
import { METHOD_VERSION, verdict, type Spot } from "./verdict";

const r2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

export type PriceRow = {
  t: string;
  kind: "prices";
  symbol: string;
  rwa_id: number;
  as_of: string | null;
  /** The tokens' consensus (median after unit conversion). */
  typical_price: number | null;
  /** Metals: CMC spot at the time of the quotes; premiums are measured against it. */
  spot: number | null;
  tokens: { id: number; token: string; price: number | null; premium_pct: number | null; volume_24h: number | null; unit: string }[];
};

export type DailyRow = {
  t: string;
  kind: "full";
  method_version: string;
  symbol: string;
  rwa_id: number;
  as_of: string | null;
  verdict: string;
  answer: string;
  typical_price: number | null;
  spot: number | null;
  tokens: { id: number; token: string; verdict: string; premium_pct: number | null; exit_score: number | null; liquidity_usd: number | null; volume_24h: number | null }[];
};

/** Hourly row from a quotes/latest response alone (no pools: exit scores aren't meaningful here). */
export function priceRow(q: RwaQuote, t: string, spot: Spot | null = null): PriceRow {
  const tokens = q.tokens.filter((x) => typeof x.crypto_id === "number");
  const v = verdict({
    asset: {
      rwa_id: q.rwa_id,
      name: q.name,
      symbol: q.symbol,
      asset_type: q.asset_type,
      average_tokenized_price: q.average_tokenized_price,
      tradfi_markets: q.tradfi_markets,
    },
    tokens,
    contracts: new Map(),
    pools: new Map(),
    spot,
  });
  return {
    t,
    kind: "prices",
    symbol: q.symbol,
    rwa_id: q.rwa_id,
    as_of: q.last_updated,
    typical_price: r2(v.reference.consensus_usd),
    spot: r2(v.reference.spot?.price_usd ?? null),
    tokens: v.wrappers.map((w) => ({
      id: w.crypto_id,
      token: w.display,
      price: r2(w.price_usd),
      premium_pct: r2(w.premium_pct),
      volume_24h: w.volume_24h === null ? null : Math.round(w.volume_24h),
      unit: w.unit,
    })),
  };
}

/** Daily row from a full live check. */
export function dailyRow(r: CheckResult, t: string): DailyRow {
  return {
    t,
    kind: "full",
    method_version: r.method_version ?? METHOD_VERSION,
    symbol: r.asset.symbol,
    rwa_id: r.asset.rwa_id,
    as_of: r.data_as_of,
    verdict: r.verdict,
    answer: answerLine(r),
    typical_price: r2(r.reference.consensus_usd),
    spot: r2(r.reference.spot?.price_usd ?? null),
    tokens: r.wrappers.map((w) => ({
      id: w.crypto_id,
      token: w.display,
      verdict: w.verdict,
      premium_pct: r2(w.premium_pct),
      exit_score: w.exit_score,
      liquidity_usd: w.dex.liquidity_usd === null ? null : Math.round(w.dex.liquidity_usd),
      volume_24h: w.volume_24h === null ? null : Math.round(w.volume_24h),
    })),
  };
}

/** history/<kind>/<SYMBOL>/<YYYY-MM>.jsonl: one file per asset per month keeps files small and diffs readable. */
export function historyPath(kind: "prices" | "daily", symbol: string, t: string): string {
  return `${kind}/${symbol.replace(/[^A-Za-z0-9._-]/g, "_")}/${t.slice(0, 7)}.jsonl`;
}

/**
 * What an hourly run should record, given the plan's monthly credits. A big plan affords a
 * full check every hour; a small one (15k) gets prices hourly and one full check a day.
 */
export function pickKind(monthlyLimit: number | null, hourUtc: number): "prices" | "full" {
  if (monthlyLimit !== null && monthlyLimit >= 100_000) return "full";
  return hourUtc === FULL_HOUR_UTC ? "full" : "prices";
}

/** On small plans, the daily full check runs in this hour. */
export const FULL_HOUR_UTC = 3;

/** Monthly credit limit from /v1/key/info, or null. */
export function monthlyLimit(keyInfo: unknown): number | null {
  const n = (keyInfo as { data?: { plan?: { credit_limit_monthly?: unknown } } })?.data?.plan?.credit_limit_monthly;
  return typeof n === "number" ? n : null;
}

/** Requests per minute from /v1/key/info, or null. */
export function rateLimitPerMinute(keyInfo: unknown): number | null {
  const n = (keyInfo as { data?: { plan?: { rate_limit_minute?: unknown } } })?.data?.plan?.rate_limit_minute;
  return typeof n === "number" && n > 0 ? n : null;
}

/**
 * Gap between snapshot calls. The live site shares the key's per-minute limit, so a run takes
 * at most half of it; when the limit is unknown it assumes a small plan (30/min).
 */
export function paceMs(perMinute: number | null): number {
  return Math.ceil(60_000 / ((perMinute ?? 30) / 2));
}

/** Credits left this month from /v1/key/info, or null if the response doesn't say. */
export function creditsLeft(keyInfo: unknown): number | null {
  const left = (keyInfo as { data?: { usage?: { current_month?: { credits_left?: unknown } } } })?.data?.usage?.current_month?.credits_left;
  return typeof left === "number" ? left : null;
}

/** Whether a run may spend `cost` credits and still leave `reserve` for the live site. */
export function mayRun(left: number | null, cost: number, reserve: number): { ok: boolean; why: string } {
  if (left === null) return { ok: false, why: "couldn't read credits left from /v1/key/info" };
  if (left - cost < reserve) return { ok: false, why: `${left} credits left; this run needs ~${cost} and ${reserve} are kept for the live site` };
  return { ok: true, why: `${left} credits left, ~${cost} for this run` };
}
