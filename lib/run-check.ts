/**
 * One check, as both GET /api/check and the server-rendered page run it.
 * Returns an HTTP status and the JSON body the client expects.
 */
import { check } from "./check";
import { createClient } from "./data-source";
import type { CheckResponse } from "./present";

export type CheckBody =
  | ({ ok: true } & CheckResponse)
  | { ok: false; error: "missing_query" | "no_api_key" | "not_found" | "upstream_error"; message: string; suggestions?: { symbol: string; name: string }[]; evidence?: unknown; mode?: string };

export async function runCheck(rawQuery: string): Promise<{ status: number; body: CheckBody }> {
  const q = rawQuery.trim();
  if (!q) return { status: 400, body: { ok: false, error: "missing_query", message: "Add ?q= with a ticker, e.g. ?q=NVDA" } };

  const source = createClient();
  if ("error" in source) return { status: 503, body: { ok: false, error: "no_api_key", message: source.error } };
  const { client, mode } = source;

  const outcome = await check(q, client);
  switch (outcome.kind) {
    case "ok": {
      // Market mood rides along so its call shows up in the Evidence drawer.
      const mood = await client.fearAndGreed();
      return { status: 200, body: { ok: true, ...outcome.result, mood: mood.ok ? mood.data : null, mode } };
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
