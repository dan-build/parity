/**
 * Pure verdict engine. No fetching, no I/O: give it the data, get a verdict.
 *
 * Everything is keyed by crypto_id — token symbols collide (two different
 * wrappers are both called "NVDA").
 */
import type { AssetType, DexPool, RwaToken, TradfiMarket, WrapperContract } from "./cmc";

export type Verdict = "FAIR" | "RICH" | "THIN" | "GHOST";

// --- tunables (exported so tests and UI copy share them) ------------------------

export const GRAMS_PER_TROY_OUNCE = 31.1035;
/** A price within ±5% of median/31.1035 is treated as quoted per gram. */
export const PER_GRAM_TOLERANCE = 0.05;
/** Premium above this (in %) → RICH. */
export const RICH_PREMIUM_PCT = 1;
/** Discount beyond this (in %) → warn, still FAIR. */
export const DISCOUNT_WARN_PCT = -1;
/** |premium| above this (in %) → GHOST: the price doesn't track the asset. */
export const OFF_TRACK_PCT = 5;
/** Exit score below this → THIN. */
export const THIN_BELOW = 40;
export const VOLUME_TIERS: [number, number][] = [
  [1_000_000, 40],
  [100_000, 25],
  [10_000, 10],
];
export const DEPTH_TIERS: [number, number][] = [
  [1_000_000, 40],
  [250_000, 25],
  [50_000, 10],
];
export const TRADFI_POINTS = 20;

// --- input / output types ----------------------------------------------------------

export type PoolLookup = { checked: true; pools: DexPool[] } | { checked: false; reason: string };

export type VerdictInput = {
  asset: {
    rwa_id: number;
    name: string;
    symbol: string;
    asset_type: AssetType;
    average_tokenized_price: number | null;
    tradfi_markets: TradfiMarket[];
  };
  tokens: RwaToken[];
  contracts: Map<number, WrapperContract>;
  pools: Map<number, PoolLookup>;
};

export type WrapperResult = {
  crypto_id: number;
  symbol: string;
  /** Symbol, plus issuer when another wrapper shares the symbol: "NVDA (Robinhood)". */
  display: string;
  name: string;
  issuer_name: string | null;
  chain: string | null;
  contract: string | null;
  price_raw: number | null;
  /** Price in the asset's reference unit (per-gram gold converted to per-ounce). */
  price_usd: number | null;
  unit: "as_quoted" | "per_gram_to_oz";
  premium_pct: number | null;
  premium_usd: number | null;
  volume_24h: number | null;
  market_cap: number | null;
  dex: {
    checked: boolean;
    not_checked_reason: string | null;
    pools: number;
    pools_missing_liquidity: number;
    /** Sum of liqUsd over pools that report it. null if none do. */
    liquidity_usd: number | null;
    biggest_pool: { exchange: string | null; pair: string; liquidity_usd: number } | null;
  };
  exit_score: number | null;
  exit_breakdown: { volume: number; dex: number; tradfi: number } | null;
  verdict: Verdict;
  reasons: string[];
};

export type Gap = { code: string; message: string; crypto_id?: number };

export type VerdictResult = {
  verdict: Verdict;
  /** crypto_id of the wrapper the headline is about; null when everything is GHOST. */
  headline_crypto_id: number | null;
  reasons: string[];
  wrappers: WrapperResult[];
  reference: {
    method: "median_of_live_wrappers";
    price_usd: number | null;
    wrappers_used: number;
    cmc_average_tokenized_price: number | null;
  };
  gaps: Gap[];
};

// --- small helpers ---------------------------------------------------------------------

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function fmtPrice(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtMoney(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${Math.round(n)}`;
}

export function fmtPct(n: number): string {
  return `${Math.abs(n).toFixed(2)}%`;
}

function tier(value: number | null, tiers: [number, number][]): number {
  if (value === null) return 0;
  for (const [min, pts] of tiers) if (value >= min) return pts;
  return 0;
}

const livePrice = (t: RwaToken) => typeof t.price === "number" && Number.isFinite(t.price) && t.price > 0;

/**
 * Checks that need no market context: derivative pseudo-wrappers and tokens with no price.
 * Returns a plain-English reason if the wrapper is a GHOST, otherwise null.
 * Used by check.ts to skip pool lookups for obvious GHOSTs.
 */
export function preScreen(t: RwaToken): string | null {
  if (t.issuer_name && /derivative/i.test(t.issuer_name)) {
    return `Listed under “${t.issuer_name}”: a price feed, not a token you can hold and sell.`;
  }
  if (!livePrice(t)) return "No live price from CoinMarketCap, so there's nothing to check against.";
  return null;
}

// --- the engine ---------------------------------------------------------------------------

export function verdict(input: VerdictInput): VerdictResult {
  const { asset, tokens, contracts, pools } = input;
  const assetLabel = asset.symbol;
  const hasTradfi = asset.tradfi_markets.length > 0;

  // 1. GHOST pre-screen.
  const ghostReason = new Map<number, string>();
  for (const t of tokens) {
    const r = preScreen(t);
    if (r) ghostReason.set(t.crypto_id, r);
  }
  const live = tokens.filter((t) => !ghostReason.has(t.crypto_id));

  // 2. Unit normalisation (commodities only): detect per-gram quotes by ratio to the median.
  const rawMedian = median(live.map((t) => t.price as number));
  const perGram = new Set<number>();
  if (asset.asset_type === "commodity" && rawMedian) {
    for (const t of live) {
      const ratio = ((t.price as number) / rawMedian) * GRAMS_PER_TROY_OUNCE;
      if (Math.abs(ratio - 1) <= PER_GRAM_TOLERANCE) perGram.add(t.crypto_id);
    }
  }
  const normalised = (t: RwaToken): number | null =>
    livePrice(t) ? (t.price as number) * (perGram.has(t.crypto_id) ? GRAMS_PER_TROY_OUNCE : 1) : null;

  // 3. Reference price: median of normalised live prices.
  const refPrices = live.map((t) => normalised(t) as number);
  const ref = median(refPrices);

  // Symbols collide ("NVDA" × 2), so copy names a wrapper by symbol + issuer when needed.
  const symbolCount = new Map<string, number>();
  for (const t of tokens) symbolCount.set(t.symbol, (symbolCount.get(t.symbol) ?? 0) + 1);
  const display = (t: RwaToken) =>
    (symbolCount.get(t.symbol) ?? 0) > 1 && t.issuer_name ? `${t.symbol} (${t.issuer_name})` : t.symbol;

  // 4–6. Per-wrapper scoring.
  const wrappers: WrapperResult[] = tokens.map((t) => {
    const c = contracts.get(t.crypto_id) ?? null;
    const lookup = pools.get(t.crypto_id);
    const poolList = lookup?.checked ? lookup.pools : [];
    const withLiq = poolList.filter((p) => p.liquidity_usd !== null);
    const biggest = withLiq.reduce<DexPool | null>(
      (b, p) => (b === null || (p.liquidity_usd as number) > (b.liquidity_usd as number) ? p : b),
      null,
    );
    const dex: WrapperResult["dex"] = {
      checked: lookup?.checked ?? false,
      not_checked_reason: lookup && !lookup.checked ? lookup.reason : lookup ? null : "not looked up",
      pools: poolList.length,
      pools_missing_liquidity: poolList.length - withLiq.length,
      liquidity_usd: withLiq.length ? withLiq.reduce((s, p) => s + (p.liquidity_usd as number), 0) : null,
      biggest_pool: biggest
        ? { exchange: biggest.exchange, pair: biggest.pair, liquidity_usd: biggest.liquidity_usd as number }
        : null,
    };

    const price = normalised(t);
    const premium_pct = price !== null && ref ? (price / ref - 1) * 100 : null;
    const premium_usd = price !== null && ref ? price - ref : null;

    const base = {
      crypto_id: t.crypto_id,
      symbol: t.symbol,
      display: display(t),
      name: t.name,
      issuer_name: t.issuer_name,
      chain: c?.platform_name ?? null,
      contract: c?.address ?? null,
      price_raw: t.price,
      price_usd: price,
      unit: perGram.has(t.crypto_id) ? ("per_gram_to_oz" as const) : ("as_quoted" as const),
      premium_pct,
      premium_usd,
      volume_24h: t.volume_24h,
      market_cap: t.market_cap,
      dex,
    };

    const pre = ghostReason.get(t.crypto_id);
    if (pre) return { ...base, exit_score: null, exit_breakdown: null, verdict: "GHOST" as const, reasons: [pre] };

    const reasons: string[] = [];
    if (perGram.has(t.crypto_id)) {
      reasons.push(
        `Priced per gram; converted to per ounce (${fmtPrice(t.price as number)} × ${GRAMS_PER_TROY_OUNCE} = ${fmtPrice(price as number)}).`,
      );
    }

    if (premium_pct !== null && Math.abs(premium_pct) > OFF_TRACK_PCT) {
      reasons.push(
        `Price is ${fmtPct(premium_pct)} ${premium_pct > 0 ? "above" : "below"} other ${assetLabel} tokens, so it doesn't track ${assetLabel}.`,
      );
      return { ...base, exit_score: null, exit_breakdown: null, verdict: "GHOST" as const, reasons };
    }

    const breakdown = {
      volume: tier(t.volume_24h, VOLUME_TIERS),
      dex: tier(dex.liquidity_usd, DEPTH_TIERS),
      tradfi: hasTradfi ? TRADFI_POINTS : 0,
    };
    const exit_score = breakdown.volume + breakdown.dex + breakdown.tradfi;

    reasons.push(premiumSentence(display(t), premium_pct as number, premium_usd as number, assetLabel));
    reasons.push(exitSentence(t.volume_24h, dex));

    const v: Verdict = exit_score < THIN_BELOW ? "THIN" : (premium_pct as number) > RICH_PREMIUM_PCT ? "RICH" : "FAIR";
    return { ...base, exit_score, exit_breakdown: breakdown, verdict: v, reasons: reasons.slice(0, 3) };
  });

  // 7. Headline: best live wrapper by verdict preference, then exit score, then market cap.
  const rank: Record<Verdict, number> = { FAIR: 0, RICH: 1, THIN: 2, GHOST: 3 };
  const liveResults = wrappers.filter((w) => w.verdict !== "GHOST");
  const best =
    [...liveResults].sort(
      (a, b) =>
        rank[a.verdict] - rank[b.verdict] ||
        (b.exit_score ?? 0) - (a.exit_score ?? 0) ||
        (b.market_cap ?? 0) - (a.market_cap ?? 0),
    )[0] ?? null;

  const ghosts = wrappers.length - liveResults.length;
  const reasons = headlineReasons({ best, wrappers, liveResults, ghosts, perGram: perGram.size, asset: input.asset });

  // 8. Gaps.
  const gaps: Gap[] = [
    {
      code: "market_pairs_unavailable",
      message:
        "We can't see which exchanges trade each token or how much trades there. That data isn't in our CoinMarketCap plan.",
    },
    {
      code: "no_underlying_price",
      message:
        asset.asset_type === "stock" || asset.asset_type === "etf"
          ? `We compare ${assetLabel} tokens with each other, not with the real ${assetLabel} share price. If they all drifted together, we wouldn't see it.`
          : `We compare ${assetLabel} tokens with each other, not with the ${asset.name.toLowerCase()} spot price. If they all drifted together, we wouldn't see it.`,
    },
  ];
  for (const w of liveResults) {
    if (!w.dex.checked) {
      gaps.push({
        code: "pools_not_checked",
        crypto_id: w.crypto_id,
        message: `${w.display}: DEX pools not checked (${w.dex.not_checked_reason}), so its exit score leaves out on-chain depth.`,
      });
    } else if (w.dex.pools_missing_liquidity > 0) {
      gaps.push({
        code: "pool_liquidity_missing",
        crypto_id: w.crypto_id,
        message: `${w.display}: ${w.dex.pools_missing_liquidity} of ${w.dex.pools} DEX pools don't report liquidity, so its depth may be understated.`,
      });
    }
  }

  return {
    verdict: best?.verdict ?? "GHOST",
    headline_crypto_id: best?.crypto_id ?? null,
    reasons,
    wrappers,
    reference: {
      method: "median_of_live_wrappers",
      price_usd: ref,
      wrappers_used: refPrices.length,
      cmc_average_tokenized_price: asset.average_tokenized_price,
    },
    gaps,
  };
}

// --- copy ------------------------------------------------------------------------------------

function premiumSentence(sym: string, pct: number, usd: number, assetLabel: string): string {
  if (Math.abs(pct) < 0.01) return `${sym} is priced in line with other ${assetLabel} tokens.`;
  const dir = pct > 0 ? "more" : "less";
  const base = `${sym} costs ${fmtPrice(Math.abs(usd))} (${fmtPct(pct)}) ${dir} than the typical ${assetLabel} token.`;
  if (pct < DISCOUNT_WARN_PCT) return `${base} A discount this big usually has a reason, so find out why before buying.`;
  return base;
}

function exitSentence(volume: number | null, dex: WrapperResult["dex"]): string {
  const vol = volume ? `${fmtMoney(volume)} traded in the last 24 hours` : "No trading volume in the last 24 hours";
  if (dex.biggest_pool) return `${vol}; its biggest DEX pool holds ${fmtMoney(dex.biggest_pool.liquidity_usd)}.`;
  if (dex.checked && dex.pools > 0) return `${vol}; its DEX pools don't report how much they hold.`;
  if (dex.checked) return `${vol}; no DEX pools found.`;
  return `${vol}; DEX pools not checked.`;
}

function headlineReasons(args: {
  best: WrapperResult | null;
  wrappers: WrapperResult[];
  liveResults: WrapperResult[];
  ghosts: number;
  perGram: number;
  asset: VerdictInput["asset"];
}): string[] {
  const { best, wrappers, liveResults, ghosts, perGram, asset } = args;
  const label = asset.symbol;
  const out: string[] = [];

  if (!best) {
    out.push(`None of the ${wrappers.length} ${label} tokens CoinMarketCap tracks has a usable live price.`);
    if (ghosts) out.push("They're derivative price feeds, have no price, or don't track the asset.");
    out.push("There's no token here we can recommend buying.");
    return out;
  }

  const who = best.display !== best.symbol || !best.issuer_name ? best.display : `${best.symbol} (${best.issuer_name})`;
  const lead: Record<Exclude<Verdict, "GHOST">, string> = {
    FAIR: `${who} is the best way to hold ${label}: fairly priced and easy to sell.`,
    RICH: `Even the best option, ${who}, costs more than other ${label} tokens.`,
    THIN: `${who} is the easiest ${label} token to sell, and it's still thin.`,
  };
  out.push(lead[best.verdict as Exclude<Verdict, "GHOST">]);
  out.push(premiumSentence(best.display, best.premium_pct as number, best.premium_usd as number, label));
  out.push(exitSentence(best.volume_24h, best.dex));

  // In priority order; anything past 6 is dropped.
  if (ghosts) {
    out.push(
      `${ghosts} of ${wrappers.length} ${label} tokens ${ghosts === 1 ? "isn't" : "aren't"} worth considering: derivative price feeds, no price, or off-track.`,
    );
  }
  if (perGram) {
    out.push(`${perGram} ${label} token${perGram > 1 ? "s are" : " is"} priced per gram; we converted to per ounce before comparing.`);
  }
  if (asset.tradfi_markets.length) {
    const venues = [...new Set(asset.tradfi_markets.map((m) => m.exchange.name))].join(", ");
    out.push(`${label} also trades directly on ${venues}, which gives you another way out.`);
  }
  const alsoFair = liveResults.filter((w) => w.verdict === "FAIR" && w.crypto_id !== best.crypto_id);
  if (alsoFair.length) {
    out.push(`Also fair: ${alsoFair.map((w) => w.display).join(", ")}.`);
  }
  return out.slice(0, 6);
}
