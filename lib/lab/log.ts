/**
 * The narrating log: one line per piece of work, timed to the reveal so each line
 * appears as the matching thing happens on the instrument. Pure; built from real
 * evidence and wrappers, never invented.
 */
import type { CheckResponse } from "../present";
import { money, pct } from "../present";
import { T } from "../reveal/timings";

export type LogLine = {
  at: number;
  verb: string;
  text: string;
  meta: string;
  tone: "call" | "unit" | "rich" | "ghost";
};

export type LogSummary = { calls: number; credits: number; verdictLine: string };

const short = (endpoint: string) => endpoint.replace(/^\/v\d+\//, "").replace("real-world-assets/", "");

export function logLines(r: CheckResponse): LogLine[] {
  const lines: LogLine[] = [];
  const ev = r.evidence;
  const credits = (e: (typeof ev)[number]) => (e.credit_count ? `${e.credit_count} cr` : "0 cr");

  const map = ev.find((e) => e.endpoint === "/v5/real-world-assets/map");
  if (map) lines.push({ at: 60, verb: "GET", text: short(map.endpoint), meta: `${r.asset.symbol} → rwa_id ${r.asset.rwa_id}`, tone: "call" });

  const quotes = ev.find((e) => e.endpoint === "/v5/real-world-assets/quotes/latest");
  if (quotes) lines.push({ at: 300, verb: "GET", text: short(quotes.endpoint), meta: `${r.wrappers.length} tokens · ${credits(quotes)}`, tone: "call" });

  const info = ev.find((e) => e.endpoint === "/v2/cryptocurrency/info");
  if (info) {
    const found = r.wrappers.filter((w) => w.contract).length;
    lines.push({ at: 520, verb: "GET", text: short(info.endpoint), meta: `${found} contracts · ${credits(info)}`, tone: "call" });
  }

  const pools = ev.filter((e) => e.endpoint === "/v1/dex/token/pools");
  if (pools.length) {
    const cr = pools.reduce((s, e) => s + (e.credit_count ?? 0), 0);
    const chains = new Set(pools.map((e) => String(e.params.platform))).size;
    lines.push({ at: 740, verb: "GET", text: `${short(pools[0].endpoint)} ×${pools.length}`, meta: `${chains} chain${chains > 1 ? "s" : ""} · ${cr} cr`, tone: "call" });
  }

  const rich = r.wrappers.filter((w) => w.verdict === "RICH");
  rich.slice(0, 1).forEach((w) =>
    lines.push({ at: T.callout.start, verb: "▲", text: w.display, meta: `${pct(w.premium_pct ?? 0)} over typical`, tone: "rich" }),
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
      }),
    );

  const ghosts = r.wrappers.filter((w) => w.verdict === "GHOST");
  if (ghosts.length === 1) {
    const w = ghosts[0];
    const why = w.price_raw === null ? "no price" : /derivative/i.test(w.issuer_name ?? "") ? "derivative feed" : "off-track";
    lines.push({ at: T.ghost.fallStart, verb: "✕", text: w.display, meta: why, tone: "ghost" });
  } else if (ghosts.length > 1) {
    lines.push({ at: T.ghost.fallStart, verb: "✕", text: `${ghosts.length} listings`, meta: "no price, feed or off-track", tone: "ghost" });
  }

  return lines.sort((a, b) => a.at - b.at);
}

export function logSummary(r: CheckResponse): LogSummary {
  const best = r.wrappers.find((w) => w.crypto_id === r.headline_crypto_id);
  const word = { FAIR: "Fair", RICH: "Rich", THIN: "Thin", GHOST: "Ghost" }[r.verdict];
  return {
    calls: r.evidence.length,
    credits: r.evidence.reduce((s, e) => s + (e.credit_count ?? 0), 0),
    verdictLine: best ? `${word} · best way in: ${best.display}` : `${word} · nothing worth holding`,
  };
}
