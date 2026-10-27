import { clientKey, siteLimiter, validQuery } from "@/lib/rate-limit";
import { rateLimitedBody, runCheck } from "@/lib/run-check";

// GET /api/check?q=NVDA → { ok, verdict, reasons, wrappers, evidence, gaps, mood, mode, ... }
// The page's own endpoint; shares a per-client budget with server-rendered ?q= pages.
export async function GET(request: Request) {
  const gate = siteLimiter(clientKey(request.headers));
  if (!gate.ok) return Response.json(rateLimitedBody(gate.retryAfter), { status: 429, headers: { "Retry-After": String(gate.retryAfter) } });
  const raw = new URL(request.url).searchParams.get("q");
  const q = validQuery(raw);
  if (!q) {
    const message = raw?.trim() ? "That doesn't look like a ticker or asset name." : "Add ?q= with a ticker, e.g. ?q=NVDA";
    return Response.json({ ok: false, error: "missing_query", message }, { status: 400 });
  }
  const { status, body } = await runCheck(q);
  return Response.json(body, { status });
}
