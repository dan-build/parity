/**
 * The narrating log: one line per piece of work, timed to the reveal so each line
 * appears as the matching thing happens on the instrument. Pure; built from real
 * evidence and wrappers, never invented. Every evidence entry is narrated (paged map
 * calls share one line), so the lines' `calls` always add up to the summary's count.
 */
import type { EvidenceEntry } from "./cmc";
import type { CheckResponse } from "./present";
import { answerLine, credits1, money, moneyShort, pct } from "./present";
import { T } from "./reveal/timings";

export type LogLine = {
  at: number;
  verb: string;
  text: string;
  meta: string;
  tone: "call" | "fail" | "unit" | "rich" | "ghost";
  /** How many API calls this line stands for (0 for findings). */
  calls: number;
};

export type LogSummary = { calls: number; credits: number; verdictLine: string };

/** Call lines are spread across this window, before the first finding (the callout). */
const CALLS = { start: 60, end: 1080 };

const short = (endpoint: string) => endpoint.replace(/^\/v\d+\//, "").replace("real-world-assets/", "rwa/");
const ok = (e: EvidenceEntry) => e.status !== null && e.status >= 200 && e.status < 300;

/** Credits this call actually spent: a live cache hit is free. */
const spent = (e: EvidenceEntry) => (e.cached && e.source === "live" ? 0 : (e.credit_count ?? 0));

export function logLines(r: CheckResponse): LogLine[] {
  const calls = callLines(r);
  const step = calls.length > 1 ? (CALLS.end - CALLS.start) / (calls.length - 1) : 0;
  const lines: LogLine[] = calls.map((l, i) => ({ ...l, at: Math.round(CALLS.start + i * step) }));

  const rich = r.wrappers.filter((w) => w.verdict === "RICH").sort((a, b) => (b.premium_pct ?? 0) - (a.premium_pct ?? 0));
  rich.slice(0, 1).forEach((w) =>
    lines.push({ at: T.callout.start, verb: "▲", text: w.display, meta: `${pct(w.premium_pct ?? 0)} over typical`, tone: "rich", calls: 0 }),
  );

  r.wrappers
    .filter((w) => w.unit === "per_gram_to_oz" && w.verdict !== "GHOST" && w.price_raw !== null && w.price_usd !== null)
    .slice(0, 2)
    .forEach((w, j) =>
      lines.push({
        at: T.perGram.growStart + j * T.perGram.stagger,
        verb: "g→oz",
        text: w.display,
        meta: `${money(w.price_raw as number)}/g → ${money(w.price_usd as number)}`,
        tone: "unit",
        calls: 0,
      }),
    );

  const ghosts = r.wrappers.filter((w) => w.verdict === "GHOST");
  if (ghosts.length === 1) {
    const w = ghosts[0];
    const why = w.price_raw === null ? "no price" : /derivative/i.test(w.issuer_name ?? "") ? "derivative feed" : "price far from the rest";
    lines.push({ at: T.ghost.fallStart, verb: "✕", text: w.display, meta: why, tone: "ghost", calls: 0 });
  } else if (ghosts.length > 1) {
    lines.push({ at: T.ghost.fallStart, verb: "✕", text: `${ghosts.length} listings`, meta: "no price, not a token, or far off", tone: "ghost", calls: 0 });
  }

  return lines.sort((a, b) => a.at - b.at);
}

/** One line per evidence entry, in call order; paged map calls fold into one line. */
function callLines(r: CheckResponse): Omit<LogLine, "at">[] {
  const byAddress = new Map(r.wrappers.filter((w) => w.contract).map((w) => [String(w.contract).toLowerCase(), w]));
  const mapPages = r.evidence.filter((e) => e.endpoint === "/v5/real-world-assets/map" && "start" in e.params);
  const out: Omit<LogLine, "at">[] = [];

  for (const e of r.evidence) {
    if (mapPages.includes(e) && e !== mapPages[0]) continue;
    const base = { verb: "GET", tone: ok(e) ? ("call" as const) : ("fail" as const), calls: 1 };
    const cr = credits1(spent(e));
    if (!ok(e)) {
      out.push({ ...base, text: short(e.endpoint), meta: `${e.status ?? "error"} · ${e.error_code ?? "no data"}` });
      continue;
    }
    switch (e.endpoint) {
      case "/v5/real-world-assets/map":
        if (e === mapPages[0]) {
          const n = mapPages.length;
          out.push({ ...base, calls: n, text: `${short(e.endpoint)} ×${n}`, meta: `searched ${n} pages → rwa_id ${r.asset.rwa_id}` });
        } else {
          out.push({ ...base, text: short(e.endpoint), meta: `${r.asset.symbol} → rwa_id ${r.asset.rwa_id} · ${cr}` });
        }
        break;
      case "/v5/real-world-assets/quotes/latest":
        out.push({ ...base, text: short(e.endpoint), meta: `${r.wrappers.length} tokens · ${cr}` });
        break;
      case "/v2/cryptocurrency/info": {
        const found = r.wrappers.filter((w) => w.contract).length;
        out.push({ ...base, text: "contracts", meta: `${found} found · ${cr}` });
        break;
      }
      case "/v1/dex/token/pools": {
        const w = byAddress.get(String(e.params.address).toLowerCase());
        const depth = !w || w.dex.pools === 0
          ? "no pools"
          : w.dex.liquidity_usd === null
            ? `${w.dex.pools} pool${w.dex.pools > 1 ? "s" : ""}, depth unknown`
            : `${moneyShort(w.dex.liquidity_usd)} deep`;
        out.push({ ...base, text: `pools · ${w?.display ?? "token"}`, meta: `${e.params.platform} · ${depth}` });
        break;
      }
      case "/v3/fear-and-greed/latest":
        out.push({ ...base, text: "fear & greed", meta: r.mood ? `${Math.round(r.mood.value)} ${r.mood.classification.toLowerCase()} · ${cr}` : cr });
        break;
      default:
        out.push({ ...base, text: short(e.endpoint), meta: cr });
    }
  }
  return out;
}

export function logSummary(r: CheckResponse): LogSummary {
  const word = { FAIR: "Fair", RICH: "Rich", THIN: "Thin", GHOST: "Ghost" }[r.verdict];
  const answer = answerLine(r);
  return {
    calls: r.evidence.length,
    credits: r.evidence.reduce((s, e) => s + spent(e), 0),
    verdictLine: `${word} · ${answer}`,
  };
}
