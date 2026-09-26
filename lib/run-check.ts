/**
 * One check, as both GET /api/check and the server-rendered page run it.
 * Returns an HTTP status and the JSON body the client expects.
 *
 * Live checks that hit a rate limit or fail are answered from fixtures when we have
 * that asset saved, so the demo never breaks; `fallback` says why.
 */
import { check, type CheckOutcome } from "./check";
import type { CmcClient, EvidenceEntry } from "./cmc";
import { createClient, fixtureClient, type DataSource, type Fallback } from "./data-source";
import type { CheckResponse } from "./present";

export type CheckBody =
  | ({ ok: true } & CheckResponse)
  | {
      ok: false;
      error: "missing_query" | "not_found" | "upstream_error";
      message: string;
      suggestions?: { symbol: string; name: string }[];
      evidence?: unknown;
      mode?: string;
    };

export async function runCheck(rawQuery: string, force?: "fixture" | "live"): Promise<{ status: number; body: CheckBody }> {
  return runCheckWith(rawQuery, createClient(force), fixtureClient);
}

/** CMC's rate-limit signals: HTTP 429, or error codes 1008–1011 (minute/daily/monthly/IP limits). */
export function isRateLimited(e: Pick<EvidenceEntry, "status" | "error_code">): boolean {
  return e.status === 429 || ["1008", "1009", "1010", "1011"].includes(e.error_code ?? "");
}

/** Why a live outcome should be replaced by saved data, or null if it's good as it is. */
function trouble(outcome: CheckOutcome): Fallback | null {
  const evidence = outcome.kind === "ok" ? outcome.result.evidence : outcome.evidence;
  if (evidence.some(isRateLimited)) return "rate_limited";
  return outcome.kind === "error" ? "unavailable" : null;
}

export async function runCheckWith(
  rawQuery: string,
  source: DataSource,
  savedClient: () => CmcClient,
): Promise<{ status: number; body: CheckBody }> {
  const q = rawQuery.trim();
  if (!q) return { status: 400, body: { ok: false, error: "missing_query", message: "Add ?q= with a ticker, e.g. ?q=NVDA" } };

  let { client, mode, fallback } = source;
  let outcome = await check(q, client);

  if (mode === "live") {
    const why = trouble(outcome);
    if (why) {
      const saved = savedClient();
      const replay = await check(q, saved);
      if (replay.kind === "ok") {
        outcome = replay;
        client = saved;
        mode = "fixture";
        fallback = why;
      } else if (why === "rate_limited") {
        return {
          status: 503,
          body: {
            ok: false,
            error: "upstream_error",
            message: "CoinMarketCap is limiting how often we can ask. Try again in a minute.",
            evidence: outcome.kind === "ok" ? outcome.result.evidence : outcome.evidence,
            mode,
          },
        };
      }
    }
  }

  switch (outcome.kind) {
    case "ok": {
      // Market mood rides along so its call shows up in the Evidence drawer.
      const mood = await client.fearAndGreed();
      return { status: 200, body: { ok: true, ...outcome.result, mood: mood.ok ? mood.data : null, mode, fallback } };
    }
    case "not_found":
      return {
        status: 404,
        body: { ok: false, error: "not_found", message: `We couldn't find “${outcome.query}”.`, suggestions: outcome.suggestions, evidence: outcome.evidence, mode },
      };
    case "error":
      return { status: 502, body: { ok: false, error: "upstream_error", message: outcome.message, evidence: outcome.evidence, mode } };
  }
}
