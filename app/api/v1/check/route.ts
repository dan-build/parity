/**
 * GET /api/v1/check?q=GOLD: the public, versioned JSON API. Same result as the MCP tool
 * (lib/mcp.ts checkOutput), plus api_version. Off unless PARITY_PUBLIC_API=on; rate limited
 * per client; successful answers are cached by the CDN for a minute.
 */
import { dataMode } from "@/lib/data-source";
import { checkRwa } from "@/lib/mcp";
import { clientKey, CORS, createLimiter, jsonError, LIMITS, PUBLIC_API_VERSION, publicApiEnabled, validQuery } from "@/lib/public-api";

const limit = createLimiter(LIMITS.publicCheck);

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(request: Request) {
  if (!publicApiEnabled()) return jsonError(503, "public_api_disabled", "The public API isn't enabled on this deployment.");
  const gate = limit(clientKey(request.headers));
  if (!gate.ok) return jsonError(429, "rate_limited", `Too many requests. Try again in ${gate.retryAfter}s.`, { retryAfter: gate.retryAfter });

  const q = validQuery(new URL(request.url).searchParams.get("q"));
  if (!q) return jsonError(400, "bad_query", "Add ?q= with a ticker or asset name (1–40 letters, digits, spaces, . & ' -), e.g. ?q=GOLD");

  const r = await checkRwa(q, new URL(request.url).origin);
  const rate = { "X-RateLimit-Remaining": String(gate.remaining) };
  if (!r.ok) {
    const status = r.error === "not_found" ? 404 : r.status >= 500 ? 502 : r.status;
    return Response.json(
      { ok: false, error: r.error, message: r.message, suggestions: r.suggestions },
      { status, headers: { ...CORS, ...rate, "Cache-Control": "no-store" } },
    );
  }
  // On a live deployment, a saved answer means CMC was unavailable: don't let the CDN keep it.
  const degraded = dataMode() === "live" && r.out.data.source === "saved";
  return Response.json(
    { ok: true, api_version: PUBLIC_API_VERSION, ...r.out },
    { headers: { ...CORS, ...rate, "Cache-Control": degraded ? "no-store" : "public, max-age=30, s-maxage=60, stale-while-revalidate=300" } },
  );
}
