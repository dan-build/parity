/**
 * Live drift check (ROADMAP evaluation principle 3): has CoinMarketCap's API changed shape
 * since fixtures/ were recorded? Compares the *shape* of responses (field paths and their
 * types), never their values, plus what the engine concludes from them (tokens, units, gaps).
 * Verdicts are expected to move with the market; they're reported, not flagged.
 *
 * Pure: give it captured responses and results, get findings. The report holds field paths,
 * types, token symbols and our own verdicts only, never CoinMarketCap values.
 */
import { requestKey, type CmcRequest, type CmcResponse, type Transport } from "./cmc";
import type { CheckOutcome } from "./check";

export type Captured = { key: string; pair: string; path: string; status: number; error_code: string | null; body: unknown };

/** Params that differ run to run by design (spot conversions are pinned to the quotes' time). */
const VOLATILE_PARAMS = new Set(["time"]);

/** Request key without volatile params: how a live call is paired with its saved twin. */
export function pairKey(req: CmcRequest): string {
  const params = Object.fromEntries(Object.entries(req.params).filter(([k]) => !VOLATILE_PARAMS.has(k)));
  return requestKey({ path: req.path, params });
}

/** Wraps a transport and keeps every response in `into`. */
export function capturing(inner: Transport, into: Captured[]): Transport {
  return async (req) => {
    const res: CmcResponse = await inner(req);
    const code = (res.body as { status?: { error_code?: unknown } })?.status?.error_code;
    into.push({ key: requestKey(req), pair: pairKey(req), path: req.path, status: res.status, error_code: code === undefined || code === null || code === 0 || code === "0" ? null : String(code), body: res.body });
    return res;
  };
}

type JsonType = "null" | "number" | "string" | "boolean" | "object" | "array";
/** Field path → the set of types seen there. Arrays collapse to `[]`; numeric keys (ids) to `<id>`. */
export type Shape = Map<string, Set<JsonType>>;

export function shapeOf(value: unknown, path = "", out: Shape = new Map()): Shape {
  const type: JsonType = value === null ? "null" : Array.isArray(value) ? "array" : (typeof value as JsonType);
  const at = path || "(root)";
  if (!out.has(at)) out.set(at, new Set());
  out.get(at)!.add(type);
  if (Array.isArray(value)) for (const v of value) shapeOf(v, `${path}[]`, out);
  else if (type === "object") for (const [k, v] of Object.entries(value as object)) shapeOf(v, `${path}.${/^\d+$/.test(k) ? "<id>" : k}`, out);
  return out;
}

export type ShapeDiff = { added: string[]; removed: string[]; changed: { path: string; saved: string; live: string }[] };

/** What's new, gone or retyped in `live` compared with `saved`. "status" fields are ignored (timestamps, credit counts). */
export function diffShapes(saved: Shape, live: Shape): ShapeDiff {
  const skip = (p: string) => p.startsWith(".status");
  const fmt = (s: Set<JsonType>) => [...s].sort().join("|");
  const diff: ShapeDiff = { added: [], removed: [], changed: [] };
  for (const [p, t] of live) {
    if (skip(p)) continue;
    const s = saved.get(p);
    if (!s) diff.added.push(p);
    else if (fmt(s) !== fmt(t)) diff.changed.push({ path: p, saved: fmt(s), live: fmt(t) });
  }
  for (const p of saved.keys()) if (!skip(p) && !live.has(p)) diff.removed.push(p);
  return diff;
}

export type Finding = { level: "warn" | "info"; asset: string; what: string };

/** Every field path seen per endpoint across saved responses (all assets): what "known" means. */
export function knownShapes(calls: Captured[]): Map<string, Shape> {
  const known = new Map<string, Shape>();
  for (const c of calls) {
    if (c.status >= 400 || c.error_code) continue;
    const into = known.get(c.path) ?? new Map();
    shapeOf(c.body, "", into);
    known.set(c.path, into);
  }
  return known;
}

/**
 * Compare one asset's saved run with its live run. Warnings are possible API surprises for
 * FRICTION.md: a field no saved response from that endpoint ever had, a field outside any
 * list that's gone, a value that is now null, a new error, a token's unit changing. Info is
 * the market: a moved verdict, new tokens or gaps, values filled in, optional row fields absent.
 * `known` (from knownShapes over all saved runs) keeps one asset's empty list from making
 * every field look new.
 */
export function compareRuns(asset: string, saved: { calls: Captured[]; outcome: CheckOutcome }, live: { calls: Captured[]; outcome: CheckOutcome }, known: Map<string, Shape> = knownShapes(saved.calls)): Finding[] {
  const out: Finding[] = [];
  const warn = (what: string) => out.push({ level: "warn", asset, what });
  const info = (what: string) => out.push({ level: "info", asset, what });

  const savedByPair = new Map<string, Captured>();
  for (const c of saved.calls) if (!savedByPair.has(c.pair)) savedByPair.set(c.pair, c);
  const seen = new Set<string>();
  for (const c of live.calls) {
    if (seen.has(c.pair)) continue;
    seen.add(c.pair);
    const s = savedByPair.get(c.pair);
    if (c.status >= 400 || c.error_code) {
      if (!s || s.status !== c.status || s.error_code !== c.error_code) warn(`${c.path}: HTTP ${c.status}${c.error_code ? `, error_code ${c.error_code}` : ""}${s ? ` (saved: HTTP ${s.status}${s.error_code ? `, ${s.error_code}` : ""})` : ""}`);
      continue;
    }
    const liveShape = shapeOf(c.body);
    const endpoint = known.get(c.path) ?? new Map();
    for (const p of diffShapes(endpoint, liveShape).added) warn(`${c.path}: new field ${p}`);
    if (!s) {
      info(`${c.path}: called live with no saved twin (${c.key}); only new fields checked`);
      continue;
    }
    const d = diffShapes(shapeOf(s.body), liveShape);
    for (const p of d.removed) (p.includes("[]") ? info : warn)(`${c.path}: field gone ${p}`);
    for (const x of d.changed) {
      const nowNull = x.live.split("|").includes("null") && !x.saved.split("|").includes("null");
      const filledIn = x.saved === "null" || (x.saved.split("|").includes("null") && !x.live.split("|").includes("null"));
      (nowNull || !filledIn ? warn : info)(`${c.path}: ${x.path} was ${x.saved}, now ${x.live}`);
    }
  }

  if (saved.outcome.kind !== "ok" || live.outcome.kind !== "ok") {
    if (saved.outcome.kind !== live.outcome.kind) warn(`check: saved ${saved.outcome.kind}, live ${live.outcome.kind}${live.outcome.kind === "error" ? ` (${live.outcome.message})` : ""}`);
    return out;
  }
  const a = saved.outcome.result;
  const b = live.outcome.result;
  if (a.verdict !== b.verdict) info(`verdict moved: ${a.verdict} → ${b.verdict}`);
  const sTok = new Map(a.wrappers.map((w) => [w.crypto_id, w]));
  const lTok = new Map(b.wrappers.map((w) => [w.crypto_id, w]));
  for (const [id, w] of lTok) if (!sTok.has(id)) info(`new token: ${w.display} (${id})`);
  for (const [id, w] of sTok) if (!lTok.has(id)) info(`token gone: ${w.display} (${id})`);
  for (const [id, w] of lTok) {
    const s = sTok.get(id);
    if (s && s.unit !== w.unit) warn(`unit changed for ${w.display}: ${s.unit} → ${w.unit}`);
  }
  const codes = (r: typeof a) => new Set(r.gaps.map((g) => g.code));
  for (const c of codes(b)) if (!codes(a).has(c)) info(`new gap: ${c}`);
  for (const c of codes(a)) if (!codes(b).has(c)) info(`gap gone: ${c}`);
  return out;
}
