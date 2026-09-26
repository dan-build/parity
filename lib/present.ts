/**
 * CheckResult → everything the page renders. Pure: copy, numbers and labels live here
 * so components only lay things out.
 */
import type { CheckResult } from "./check";
import type { EvidenceEntry } from "./cmc";
import type { CoinKind } from "./reveal/layout";
import { OFF_TRACK_PCT, type Gap, type Verdict, type WrapperResult } from "./verdict";

export type Mood = { value: number; classification: string; updated: string | null };
export type CheckResponse = CheckResult & { mood: Mood | null; mode: "fixture" | "live" };

export type Tone = "fair" | "rich" | "thin" | "ghost" | "unit" | "exit" | "off";

export type ReasonView = { tone: Tone; strong: string; rest: string };

export type InstrumentCoin = {
  id: number;
  ticker: string;
  /** Unambiguous name for the coin's tooltip: "NVDA (Robinhood)". */
  display: string;
  kind: CoinKind;
  verdict: Verdict;
  /** Normalised premium in %, null for GHOSTs without a usable price. */
  premium: number | null;
};

export type RowView = {
  id: number;
  ticker: string;
  sub: string;
  verdict: Verdict;
  coin: "gold" | "ghost";
  price: string;
  priceNote: { text: string; tone: "unit" | "mute" } | null;
  premium: { text: string; tone: "fair" | "rich" | "ghost" };
  exit: { bars: number; word: string };
  /** The best way in (the headline token). */
  best: boolean;
};

/** The hero's four at-a-glance tiles. */
export type SummaryTile = { label: string; value: string; note: string };

export type GapView = { icon: "exchange" | "waves" | "target" | "lock" | "info"; title: string; sub: string };

export type EvidenceView = {
  id: string;
  label: string;
  meta: string;
  ok: boolean;
  note: string | null;
  /** When the call was made (ISO), null for rows we didn't call. */
  at: string | null;
  excerpt: unknown;
  /** Not a call we made: a known limit we show for completeness. */
  static?: boolean;
};

export type View = {
  asset: { name: string; symbol: string; noun: string; total: number; claimLine: string };
  headline: { verdict: Verdict; word: string; sub: string };
  reasons: ReasonView[];
  summary: SummaryTile[];
  instrument: {
    reference: { label: string; price: string };
    coins: InstrumentCoin[];
    zone: { label: string; pct: string } | null;
    callout: { id: number; text: string } | null;
    stackNote: (n: number, ids: number[]) => string;
    ghostNote: string | null;
  };
  list: { title: string; unitLine: string; rows: RowView[] };
  /** Some tokens can be held, but none traded in the last day: no way in is recommended. */
  noEasyExit: boolean;
  route: {
    ticker: string;
    /** Symbol, plus issuer when another token shares the symbol. */
    display: string;
    by: string | null;
    /** Where the token lives: chain and a shortened contract, when CMC gave them. */
    where: { label: string; value: string }[];
    line: string;
    stats: { value: string; label: string }[];
  } | null;
  gaps: GapView[];
  evidence: EvidenceView[];
  fine: string;
  mode: "fixture" | "live";
};

export const VERDICT_WORD: Record<Verdict, string> = { FAIR: "Fair", RICH: "Rich", THIN: "Thin", GHOST: "Ghost" };

// --- formatting --------------------------------------------------------------------

export const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Signed percent with a true minus sign: +0.14%, −0.14%. */
export const pct = (p: number, digits = 2) => `${p >= 0 ? "+" : "−"}${Math.abs(p).toFixed(digits)}%`;

/** $6, $0.26, $33, $1.2k, $3.0M */
export function moneyShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `$${Math.round(a / 1e3)}k`;
  if (a >= 10) return `$${Math.round(a)}`;
  return `$${a.toFixed(2)}`;
}

export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return "";
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** 5 rising bars and a word, from the engine's 0–100 exit score. */
export function exitMeter(score: number | null): { bars: number; word: string } {
  if (score === null || score <= 0) return { bars: 0, word: "None" };
  if (score >= 80) return { bars: 5, word: "Deep" };
  if (score >= 60) return { bars: 4, word: "Good" };
  if (score >= 40) return { bars: 3, word: "Some" };
  if (score >= 20) return { bars: 2, word: "Thin" };
  return { bars: 1, word: "Thin" };
}

const isDerivative = (w: WrapperResult) => !!w.issuer_name && /derivative/i.test(w.issuer_name);
const isOffTrack = (w: WrapperResult) =>
  w.verdict === "GHOST" && w.premium_pct !== null && Math.abs(w.premium_pct) > OFF_TRACK_PCT;

/**
 * The token we point people to: the engine's headline token, unless nothing trades.
 * A token with no volume in the last 24 hours isn't a way in, however well it ranks.
 */
export function recommended(r: Pick<CheckResult, "wrappers" | "headline_crypto_id">): WrapperResult | null {
  const top = r.wrappers.find((w) => w.crypto_id === r.headline_crypto_id) ?? null;
  return top && (top.volume_24h ?? 0) > 0 ? top : null;
}

// --- the view --------------------------------------------------------------------------

export function present(r: CheckResponse, now = Date.now()): View {
  const commodity = r.asset.asset_type === "commodity";
  const noun = commodity ? r.asset.name.toLowerCase() : r.asset.symbol;
  const Noun = commodity ? r.asset.name : r.asset.symbol;
  const unitWord = commodity ? "ounce" : r.asset.asset_type === "stock" || r.asset.asset_type === "etf" ? "share" : "unit";
  const ws = r.wrappers;
  const live = ws.filter((w) => w.verdict !== "GHOST");
  const top = ws.find((w) => w.crypto_id === r.headline_crypto_id) ?? null;
  const best = recommended(r);
  const ghosts = ws.filter((w) => w.verdict === "GHOST");
  const perGram = ws.filter((w) => w.unit === "per_gram_to_oz" && w.verdict !== "GHOST");
  const ref = r.reference.price_usd;

  // Headline
  const sub: Record<Verdict, string> = {
    FAIR: live.every((w) => w.verdict === "FAIR") && !ws.some(isOffTrack) ? "whichever token you pick." : "if you pick the right token.",
    RICH: "even the best token costs extra.",
    THIN: "not much market to sell into.",
    GHOST: "nothing here you can really hold.",
  };

  // Reasons (design style: bold fact + plain rest), in priority order, max 4.
  const reasons: ReasonView[] = [];
  // When nothing trades, a tight price spread is beside the point; that reason makes way.
  if (live.length && !(top && !best)) {
    const within = [0.1, 0.2, 0.5, 1].find((th) => live.filter((w) => Math.abs(w.premium_pct ?? 99) <= th).length >= Math.ceil(live.length / 2));
    if (within !== undefined) {
      const k = live.filter((w) => Math.abs(w.premium_pct ?? 99) <= within).length;
      reasons.push({ tone: "fair", strong: `${k} of ${ws.length}`, rest: ` trade within ${within}% of the typical price.` });
    }
  }
  if (perGram.length) {
    reasons.push({
      tone: "unit",
      strong: `${perGram.length === 1 ? "1 is" : `${perGram.length} are`} priced per gram.`,
      rest: ` We converted ${perGram.length === 1 ? "it" : "them"} so you can compare.`,
    });
  }
  const rich = live.filter((w) => w.verdict === "RICH").sort((a, b) => (b.premium_pct ?? 0) - (a.premium_pct ?? 0));
  if (rich[0]) {
    const w = rich[0];
    reasons.push({
      tone: "rich",
      strong: `${w.display} costs ${Math.abs(w.premium_pct ?? 0).toFixed(2)}% extra,`,
      rest: ` about ${moneyShort(w.premium_usd ?? 0)} a${unitWord === "ounce" ? "n" : ""} ${unitWord}.`,
    });
  }
  const unholdable = ghosts.filter((w) => !isOffTrack(w));
  if (unholdable.length) {
    const noPrice = unholdable.every((w) => w.price_raw === null);
    reasons.push({
      tone: "ghost",
      strong: `${unholdable.length} listing${unholdable.length > 1 ? "s" : ""} ${noPrice ? (unholdable.length > 1 ? "have" : "has") + " no price." : (unholdable.length > 1 ? "aren't" : "isn't") + " a token."}`,
      rest: noPrice ? " It isn't something you can hold." : " Derivative price feeds, not something you can hold.",
    });
  }
  const offTrack = ghosts.filter(isOffTrack);
  if (offTrack.length) {
    const w = offTrack[0];
    reasons.push({
      tone: "off",
      strong: offTrack.length > 1 ? `${offTrack.length} don't track ${Noun}.` : `${w.display} is ${Math.abs(w.premium_pct ?? 0).toFixed(0)}% off.`,
      rest: offTrack.length > 1 ? " Their prices are far from the others." : ` It doesn't track ${noun}.`,
    });
  }
  const thin = live.filter((w) => w.verdict === "THIN");
  if (thin.length && thin.length !== live.length) {
    reasons.push({ tone: "thin", strong: `${thin.length} ${thin.length > 1 ? "are" : "is"} thin.`, rest: " Little trading to sell into later." });
  }
  if (best) {
    reasons.push({
      tone: "exit",
      strong: `${best.display} is easiest to sell,`,
      rest: ` ${moneyShort(best.volume_24h ?? 0)} traded in the last day.`,
    });
  } else if (top) {
    reasons.unshift({ tone: "thin", strong: "Nothing traded in the last day.", rest: " Selling any of these later could be hard." });
  }

  // Instrument
  const coinKind = (w: WrapperResult): CoinKind =>
    w.verdict === "GHOST" ? "ghost" : w.unit === "per_gram_to_oz" ? "gram" : "coin";
  const ordered = [...ws.filter((w) => coinKind(w) === "coin"), ...ws.filter((w) => coinKind(w) === "gram"), ...ghosts];
  const coins: InstrumentCoin[] = ordered.map((w) => ({
    id: w.crypto_id,
    ticker: w.symbol,
    display: w.display,
    kind: coinKind(w),
    verdict: w.verdict,
    premium: w.verdict === "GHOST" ? null : w.premium_pct,
  }));
  const rawGram = perGram.find((w) => w.price_raw !== null && ref);
  const zoneDiscount = rawGram && ref ? ((rawGram.price_raw as number) / ref - 1) * 100 : null;
  const ghostNote =
    ghosts.length === 0
      ? null
      : ghosts.length === 1
        ? ghostLine(ghosts[0], noun)
        : `${ghosts.length} listings fell through: no price, not a token, or a price far from the rest`;

  // List
  const rows: RowView[] = ws.map((w) => {
    const chain = w.chain && w.chain !== w.issuer_name ? w.chain : null;
    const sub = [w.issuer_name, chain].filter(Boolean).join(", ") || "Unknown issuer";
    let price = w.price_usd === null ? "No price" : money(w.price_usd);
    let priceNote: RowView["priceNote"] = null;
    if (w.unit === "per_gram_to_oz" && w.price_raw !== null) priceNote = { text: `Converted from ${money(w.price_raw)} per gram`, tone: "unit" };
    else if (w.price_usd === null) priceNote = { text: "Nothing to compare", tone: "mute" };
    else if (w.verdict === "GHOST" && isDerivative(w)) {
      price = "Not a token";
      priceNote = { text: "Derivative price feed", tone: "mute" };
    } else if (isOffTrack(w)) priceNote = { text: `Doesn't track ${noun}`, tone: "mute" };
    return {
      id: w.crypto_id,
      ticker: w.symbol,
      sub,
      verdict: w.verdict,
      coin: w.verdict === "GHOST" ? "ghost" : "gold",
      price,
      priceNote,
      premium:
        w.premium_pct === null || (w.verdict === "GHOST" && !isOffTrack(w))
          ? { text: "—", tone: "ghost" }
          : { text: pct(w.premium_pct), tone: w.verdict === "RICH" ? "rich" : isOffTrack(w) ? "ghost" : "fair" },
      exit: w.verdict === "GHOST" ? { bars: 0, word: "None" } : exitMeter(w.exit_score),
      best: w.crypto_id === best?.crypto_id,
    };
  });

  // Best way in
  const route = best
    ? {
        ticker: best.symbol,
        display: best.display,
        by: best.issuer_name && !/derivative/i.test(best.issuer_name) ? best.issuer_name : null,
        where: [
          best.chain ? { label: "chain", value: best.chain } : null,
          best.contract ? { label: "contract", value: shortAddress(best.contract) } : null,
        ].filter((x): x is { label: string; value: string } => x !== null),
        line: routeLine(best.verdict),
        stats: [
          { value: pct(best.premium_pct ?? 0), label: `${(best.premium_pct ?? 0) >= 0 ? "over" : "under"} the typical price` },
          {
            value: moneyShort(best.premium_usd ?? 0),
            label: `${(best.premium_usd ?? 0) >= 0 ? "extra" : "less"} per ${unitWord}`,
          },
          { value: exitMeter(best.exit_score).word, label: "exit" },
        ],
      }
    : null;

  // Summary tiles
  const livePrems = live.map((w) => w.premium_pct).filter((p): p is number => p !== null);
  const traded = live.reduce((n, w) => n + (w.volume_24h ?? 0), 0);
  const busiest = live.reduce<WrapperResult | null>((b, w) => ((w.volume_24h ?? 0) > (b?.volume_24h ?? 0) ? w : b), null);
  const summary: SummaryTile[] = [
    { label: "Typical price", value: ref === null ? "—" : money(ref), note: `per ${commodity ? "troy ounce" : unitWord}` },
    livePrems.length > 1
      ? { label: "Price spread", value: `${(Math.max(...livePrems) - Math.min(...livePrems)).toFixed(2)}%`, note: `across ${livePrems.length} live` }
      : { label: "Price spread", value: "—", note: livePrems.length ? "only 1 live token" : "no live tokens" },
    traded > 0 && busiest
      ? { label: "Traded, 24h", value: moneyShort(traded), note: `${Math.round(((busiest.volume_24h ?? 0) / traded) * 100)}% in ${busiest.display}` }
      : { label: "Traded, 24h", value: "$0", note: "nothing traded" },
    { label: "Tokens checked", value: String(ws.length), note: checkedNote(ghosts.filter((w) => !isOffTrack(w)).length, ghosts.filter(isOffTrack).length) },
  ];

  return {
    asset: {
      name: r.asset.name,
      symbol: r.asset.symbol,
      noun,
      total: ws.length,
      claimLine: `${ws.length} token${ws.length === 1 ? "" : "s"} claim to be it`,
    },
    headline: { verdict: r.verdict, word: VERDICT_WORD[r.verdict], sub: sub[r.verdict] },
    reasons: reasons.slice(0, 4),
    summary,
    instrument: {
      reference: { label: `${Noun} tokens`, price: ref === null ? "—" : money(ref) },
      coins,
      zone: zoneDiscount === null ? null : { label: `Looks ${Math.abs(zoneDiscount).toFixed(0)}% cheaper`, pct: pct(zoneDiscount, 0) },
      callout: rich[0] ? { id: rich[0].crypto_id, text: `${pct(rich[0].premium_pct ?? 0)}, ${moneyShort(rich[0].premium_usd ?? 0)} extra` } : null,
      stackNote: (n, ids) => {
        const maxAbs = Math.max(...ids.map((id) => Math.abs(ws.find((w) => w.crypto_id === id)?.premium_pct ?? 0)));
        return `${n} within ${(Math.ceil(maxAbs / 0.05) * 0.05 || 0.05).toFixed(2)}%`;
      },
      ghostNote,
    },
    list: {
      title: `Every token that claims to be ${noun}`,
      unitLine: `Per ${commodity ? "troy ounce" : unitWord}${freshness(r, now)}`,
      rows,
    },
    route,
    noEasyExit: top !== null && best === null,
    gaps: gapViews(r.gaps, noun, commodity),
    evidence: evidenceViews(r.evidence, ws),
    fine: `Not financial advice. Prices from CoinMarketCap. Premiums compare each token with the typical price of all ${noun} tokens, after converting units.`,
    mode: r.mode,
  };
}

/** 0x6874…2F38: enough to match against the issuer's site, short enough to read. */
export const shortAddress = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

function checkedNote(unholdable: number, offTrack: number): string {
  const parts = [
    unholdable ? `${unholdable} can't be held` : null,
    offTrack ? `${offTrack} ${offTrack > 1 ? "don't" : "doesn't"} track it` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "all can be held";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "25 Sep 2026" in UTC, the same on every server and browser (locales disagree on "Sept"). */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** ", 3 min ago" live; ", saved data from 25 Sep 2026" when replaying fixtures (a replay isn't stale). */
function freshness(r: CheckResponse, now: number): string {
  if (!r.data_as_of) return "";
  if (r.mode === "fixture") {
    return `, saved data from ${dayLabel(r.data_as_of)}`;
  }
  return `, ${relativeTime(r.data_as_of, now)}`;
}

/** "1 credit", "0 credits". */
export const credits1 = (n: number) => `${n} credit${n === 1 ? "" : "s"}`;

function ghostLine(w: WrapperResult, noun: string): string {
  if (w.price_raw === null) return `${w.display} has no price`;
  if (isOffTrack(w)) return `${w.display} doesn't track ${noun}`;
  return `${w.display} (derivative listing) isn't a token`;
}

function routeLine(v: Verdict): string {
  switch (v) {
    case "FAIR":
      return "Fairly priced, and the most traded, so the easiest to sell later.";
    case "RICH":
      return "The least overpriced option, with a real market to sell into.";
    case "THIN":
      return "The easiest to sell of a thin bunch. Keep it small.";
    default:
      return "";
  }
}

function gapViews(gaps: Gap[], noun: string, commodity: boolean): GapView[] {
  const out: GapView[] = [];
  const has = (c: string) => gaps.some((g) => g.code === c);
  if (has("market_pairs_unavailable")) {
    out.push({ icon: "exchange", title: "Which exchanges you can sell on", sub: "Market pairs aren't included in our API plan." });
  }
  const missing = gaps.filter((g) => g.code === "pool_liquidity_missing").length;
  const unchecked = gaps.filter((g) => g.code === "pools_not_checked").length;
  if (missing || unchecked) {
    const parts = [
      missing ? "Some DEX pools don't report liquidity" : null,
      unchecked ? `${unchecked} token${unchecked > 1 ? "s live" : " lives"} on chains we can't check yet` : null,
    ].filter(Boolean);
    out.push({ icon: "waves", title: "How deep every pool is", sub: `${parts.join(", and ")}.` });
  }
  if (has("no_underlying_price")) {
    out.push({
      icon: "target",
      title: commodity ? `The ${noun} spot price` : `The real ${noun} share price`,
      sub: "We compare tokens with each other. If they all drifted together, we wouldn't see it.",
    });
  }
  for (const g of gaps.filter((x) => x.code === "ambiguous_query" || x.code === "contracts_unavailable")) {
    out.push({ icon: "info", title: g.code === "ambiguous_query" ? "Which asset you meant" : "Token contracts", sub: g.message });
  }
  out.push({
    icon: "lock",
    title: commodity ? `Whether the ${noun} is really in the vault` : "Whether the shares are really held",
    sub: "No API can check that. Read the issuer's attestations.",
  });
  return out;
}

function evidenceViews(evidence: EvidenceEntry[], ws: WrapperResult[]): EvidenceView[] {
  const byAddress = new Map(ws.filter((w) => w.contract).map((w) => [String(w.contract).toLowerCase(), w]));
  const out: EvidenceView[] = [];
  const mapPages = evidence.filter((e) => e.endpoint === "/v5/real-world-assets/map" && "start" in e.params);
  evidence.forEach((e, i) => {
    if (mapPages.includes(e) && e !== mapPages[0]) return; // collapse paged map into one row
    const ok = e.status !== null && e.status >= 200 && e.status < 300;
    let label = `GET ${e.endpoint}`;
    if (e.endpoint === "/v1/dex/token/pools") {
      const w = byAddress.get(String(e.params.address).toLowerCase());
      label += ` · ${w?.display ?? "token"} on ${e.params.platform}`;
    } else if (e === mapPages[0]) {
      label += ` · ${mapPages.length} pages`;
    } else if (Object.keys(e.params).length) {
      const qs = Object.entries(e.params)
        .filter(([k]) => k !== "skip_invalid")
        .map(([k, v]) => {
          const s = String(v);
          return `${k}=${s.includes(",") ? `${s.split(",")[0]},…` : s}`;
        })
        .join("&");
      label += `?${qs}`;
    }
    const credits = e === mapPages[0] ? 0 : e.credit_count;
    out.push({
      id: `${i}`,
      label,
      // Live: a cache hit spent nothing, say so. Fixture: show what the recorded call cost.
      meta: !ok ? String(e.status ?? "error") : e.cached && e.source === "live" ? "cached" : credits1(credits ?? 0),
      ok,
      note: ok ? null : `CoinMarketCap said: ${e.error_code ?? e.status}`,
      at: e.fetched_at,
      excerpt: curate(e),
    });
  });
  out.push({
    id: "market-pairs",
    label: "GET /v5/real-world-assets/market-pairs/list",
    meta: "403",
    ok: false,
    note: "Not called: it returns 403 on our plan. Shown under “What the data can’t tell you”.",
    at: null,
    excerpt: null,
    static: true,
  });
  return out;
}

/**
 * The drawer shows the fields that matter for each call, with values exactly as CMC
 * returned them (already trimmed to 3 array items by the client).
 */
function curate(e: EvidenceEntry): unknown {
  const x = e.excerpt as Record<string, unknown> | null;
  if (!x || typeof x !== "object") return x;
  const data = (x as { data?: unknown }).data;
  if (e.endpoint === "/v5/real-world-assets/quotes/latest") {
    const a = (data as { rwa_assets?: Record<string, unknown>[] } | undefined)?.rwa_assets?.[0];
    if (!a) return x;
    const tokens = Array.isArray(a.tokens)
      ? a.tokens.map((t) =>
          typeof t === "object" && t ? { symbol: t.symbol, issuer_name: t.issuer_name, price: t.price } : t,
        )
      : a.tokens;
    return { average_tokenized_price: a.average_tokenized_price, tokens };
  }
  if (e.endpoint === "/v1/dex/token/pools" && Array.isArray(data)) {
    return data.map((p) =>
      typeof p === "object" && p
        ? { exn: p.exn, liqUsd: p.liqUsd, v24: p.v24, pair: `${p.t0?.sym ?? "?"}/${p.t1?.sym ?? "?"}` }
        : p,
    );
  }
  return x;
}
