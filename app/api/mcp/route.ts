/**
 * POST /api/mcp: Parity's MCP server over Streamable HTTP, stateless (a fresh server per
 * request, JSON responses, no sessions), so it works on serverless. One read-only tool,
 * check_rwa. Off unless PARITY_PUBLIC_API=on; rate limited per client.
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createParityServer } from "@/lib/mcp";
import { clientKey, CORS, createLimiter, jsonError, LIMITS, publicApiEnabled, readBody } from "@/lib/public-api";

const limit = createLimiter(LIMITS.mcp);
const MAX_BODY_BYTES = 64 * 1024;
/** This endpoint only takes POST; say so in CORS too. */
const METHODS = { "Access-Control-Allow-Methods": "POST, OPTIONS" };

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS, ...METHODS } });
}

/** Stateless: no server-to-client stream (GET) and no sessions to end (DELETE). */
function notAllowed() {
  return jsonError(405, "method_not_allowed", "This MCP endpoint is stateless: send JSON-RPC requests with POST.", { headers: { Allow: "POST, OPTIONS", ...METHODS } });
}
export const GET = notAllowed;
export const DELETE = notAllowed;

export async function POST(request: Request) {
  const fail = (status: number, error: string, message: string, retryAfter?: number) => jsonError(status, error, message, { retryAfter, headers: METHODS });
  if (!publicApiEnabled()) return fail(503, "public_api_disabled", "The public MCP endpoint isn't enabled on this deployment.");
  const gate = limit(clientKey(request.headers));
  if (!gate.ok) return fail(429, "rate_limited", `Too many requests. Try again in ${gate.retryAfter}s.`, gate.retryAfter);

  // Read the body ourselves: a hard size cap (chunked uploads have no content-length), and
  // one JSON-RPC message per request, so a batch can't run 100 checks for one rate-limit hit.
  const raw = await readBody(request, MAX_BODY_BYTES);
  if (raw === null) return fail(413, "too_large", `Request body is over ${MAX_BODY_BYTES / 1024} KB.`);
  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return fail(400, "bad_json", "The body must be one JSON-RPC message.");
  }
  if (Array.isArray(message)) return fail(400, "batch_not_supported", "Send one JSON-RPC message per request; batches aren't accepted.");

  const server = createParityServer({ siteUrl: new URL(request.url).origin });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  const res = await transport.handleRequest(request, { parsedBody: message });
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries({ ...CORS, ...METHODS })) headers.set(k, v);
  headers.set("X-RateLimit-Remaining", String(gate.remaining));
  headers.set("Cache-Control", "no-store");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
