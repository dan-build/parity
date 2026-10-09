/**
 * The verdict eval: two checks over saved data, both deterministic.
 *
 * 1. Golden set (evals/golden.json): human-written truths per asset ("GOLD is FAIR, XAUt
 *    is the way in, 2 tokens are per gram"). Any miss is a failure.
 * 2. Baseline (evals/baseline.json): a machine snapshot of every token's verdict and
 *    numbers. Any difference is reported. A difference while METHOD_VERSION is unchanged
 *    is a failure: changing the method means bumping the version and logging why.
 *
 * Pure: give it results, get findings. scripts/eval.ts does the I/O.
 */
import { present } from "./present";
import type { CheckBody } from "./run-check";

export type GoldenCase = {
  q: string;
  /** Why this asset is in the set: what it proves. */
  why: string;
  verdict: "FAIR" | "RICH" | "THIN" | "GHOST";
  answer: string;
  sub?: string;
  tokens?: number;
  per_gram?: number;
  ghosts?: number;
  /** Each must match at least one reason (bold part + rest), as a regex. */
  reasons_include?: string[];
  /** Tile label → exact value. */
  tiles?: Record<string, string>;
};

export type TokenSnapshot = {
  token: string;
  verdict: string;
  unit: string;
  premium_pct: number | null;
  exit_score: number | null;
};

export type AssetSnapshot = {
  verdict: string;
  answer: string;
  sub: string;
  reference_price: number | null;
  tokens: Record<string, TokenSnapshot>;
};

export type Baseline = { method_version: string; assets: Record<string, AssetSnapshot> };

const round = (n: number | null, d = 2) => (n === null ? null : Math.round(n * 10 ** d) / 10 ** d);

export function snapshot(body: Extract<CheckBody, { ok: true }>): AssetSnapshot {
  const v = present(body);
  const tokens: Record<string, TokenSnapshot> = {};
  for (const w of body.wrappers) {
    tokens[String(w.crypto_id)] = {
      token: w.display,
      verdict: w.verdict,
      unit: w.unit,
      premium_pct: round(w.premium_pct),
      exit_score: w.exit_score,
    };
  }
  return {
    verdict: body.verdict,
    answer: v.headline.chip,
    sub: v.headline.sub,
    reference_price: round(body.reference.price_usd),
    tokens,
  };
}

/** Human-readable differences between two snapshots of the same asset. */
export function diffSnapshot(q: string, before: AssetSnapshot | undefined, after: AssetSnapshot): string[] {
  if (!before) return [`${q}: new in the set`];
  const out: string[] = [];
  for (const k of ["verdict", "answer", "sub", "reference_price"] as const) {
    if (before[k] !== after[k]) out.push(`${q}: ${k} ${JSON.stringify(before[k])} → ${JSON.stringify(after[k])}`);
  }
  const ids = new Set([...Object.keys(before.tokens), ...Object.keys(after.tokens)]);
  for (const id of ids) {
    const a = before.tokens[id];
    const b = after.tokens[id];
    if (!a) out.push(`${q}: token ${b.token} added`);
    else if (!b) out.push(`${q}: token ${a.token} removed`);
    else {
      for (const k of ["token", "verdict", "unit", "premium_pct", "exit_score"] as const) {
        if (a[k] !== b[k]) out.push(`${q}: ${a.token} ${k} ${JSON.stringify(a[k])} → ${JSON.stringify(b[k])}`);
      }
    }
  }
  return out;
}

/** Every string inside a value: the text a reader could see. */
function strings(x: unknown): string[] {
  if (typeof x === "string") return [x];
  if (Array.isArray(x)) return x.flatMap(strings);
  if (x && typeof x === "object") return Object.values(x).flatMap(strings);
  return [];
}

/** Every way a result misses its golden case (empty = pass). */
export function checkGolden(c: GoldenCase, body: CheckBody): string[] {
  if (!body.ok) return [`${c.q}: no result (${body.error}: ${body.message})`];
  const v = present(body);
  const miss: string[] = [];
  const expect = (what: string, want: unknown, got: unknown) => {
    if (want !== undefined && want !== got) miss.push(`${c.q}: ${what} should be ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  };
  expect("verdict", c.verdict, body.verdict);
  expect("answer", c.answer, v.headline.chip);
  expect("sub", c.sub, v.headline.sub);
  expect("tokens", c.tokens, body.wrappers.length);
  expect("per-gram tokens", c.per_gram, body.wrappers.filter((w) => w.unit === "per_gram_to_oz").length);
  expect("ghosts", c.ghosts, body.wrappers.filter((w) => w.verdict === "GHOST").length);
  const reasons = v.reasons.map((r) => `${r.strong}${r.rest}`);
  for (const pattern of c.reasons_include ?? []) {
    if (!reasons.some((r) => new RegExp(pattern).test(r))) miss.push(`${c.q}: no reason matches /${pattern}/ (got: ${reasons.join(" | ")})`);
  }
  for (const [label, value] of Object.entries(c.tiles ?? {})) {
    expect(`tile "${label}"`, value, v.summary.find((t) => t.label === label)?.value);
  }
  // Rules that hold for every asset, golden or not, checked on the words a person reads.
  // Includes the engine's raw reasons too: they ship in /api/check and the MCP tool.
  const copy = strings([v.headline, v.reasons, v.summary, v.route, v.gaps, v.instrument.ghostNote, v.instrument.coins.map((x) => x.tooltip), v.list, v.fine, body.reasons, body.wrappers.map((w) => w.reasons)]);
  const said = (re: RegExp) => copy.filter((t) => re.test(t));
  for (const t of said(/\bbuy(s|ing)?\b/i)) miss.push(`${c.q}: copy says "buy": "${t}"`);
  for (const t of said(/#\d{3,}|\bnull\b|\bundefined\b|\bNaN\b/)) miss.push(`${c.q}: copy shows a raw id, null, undefined or NaN: "${t}"`);
  return miss;
}
