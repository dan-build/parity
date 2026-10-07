/**
 * Shared protection for everything that can spend CoinMarketCap credits on a request:
 * the public API (/api/v1/check), the hosted MCP endpoint (/api/mcp), and the page's own
 * /api/check and server-rendered ?q= pages.
 *
 * - The public endpoints are OFF unless PARITY_PUBLIC_API=on (CMC's terms on redistributing
 *   data are still to be checked; see design/AFTER-RESULTS.md).
 * - Per-client rate limits, in memory. On serverless every instance keeps its own counts, so
 *   this is a guard, not a guarantee; the CDN cache (Cache-Control) absorbs repeat requests,
 *   and the CMC client's own 60s cache absorbs the rest.
 */

export const PUBLIC_API_VERSION = "1";

export const publicApiEnabled = () => process.env.PARITY_PUBLIC_API === "on";

/** Requests per client per minute. A live check costs ~5–7 credits. */
export const LIMITS = {
  /** /api/v1/check */
  publicCheck: { limit: 30, windowMs: 60_000 },
  /** /api/mcp (every JSON-RPC request counts, not only tool calls) */
  mcp: { limit: 60, windowMs: 60_000 },
  /** The page: /api/check and server-rendered ?q= pages, shared */
  site: { limit: 60, windowMs: 60_000 },
} as const;

export type Limiter = (key: string) => { ok: true; remaining: number } | { ok: false; retryAfter: number };

/** Sliding-window limiter: at most `limit` hits per `windowMs` per key. */
export function createLimiter({ limit, windowMs }: { limit: number; windowMs: number }, now: () => number = Date.now): Limiter {
  const hits = new Map<string, number[]>();
  return (key) => {
    const t = now();
    const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return { ok: false, retryAfter: Math.max(1, Math.ceil((windowMs - (t - recent[0])) / 1000)) };
    }
    recent.push(t);
    hits.set(key, recent);
    // Keep memory bounded: drop keys with nothing in the window.
    if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((x) => t - x < windowMs)) hits.delete(k);
    return { ok: true, remaining: limit - recent.length };
  };
}

/** One limiter for the whole site (page renders + /api/check share a budget per client). */
export const siteLimiter = createLimiter(LIMITS.site);

/**
 * The client's address. On Vercel, x-forwarded-for is set by the platform with the real
 * client first; elsewhere it can be spoofed, which only lets a client split its own budget.
 */
export function clientKey(headers: Headers): string {
  const ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim();
  return ip ? networkOf(ip) : "unknown";
}

/** IPv4 as is; IPv6 by its /64 network, since one client usually controls a whole /64. */
export function networkOf(ip: string): string {
  if (!ip.includes(":")) return ip;
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const full = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
  return `${full.slice(0, 4).map((x) => x.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, accept, mcp-protocol-version, mcp-session-id",
  "Access-Control-Expose-Headers": "mcp-protocol-version, retry-after, x-ratelimit-remaining",
  "Access-Control-Max-Age": "86400",
};

/**
 * Read a request body, stopping at `maxBytes` whatever content-length claims (chunked uploads
 * have none). Null when it's too big.
 */
export async function readBody(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export function jsonError(status: number, error: string, message: string, extra: { retryAfter?: number; headers?: Record<string, string> } = {}): Response {
  const headers: Record<string, string> = { ...CORS, "Cache-Control": "no-store", ...extra.headers };
  if (extra.retryAfter) headers["Retry-After"] = String(extra.retryAfter);
  return Response.json({ ok: false, error, message }, { status, headers });
}

/** A ticker or asset name: 1–40 letters, digits, spaces and . & ' - . Null if invalid. */
export function validQuery(raw: string | null): string | null {
  const q = raw?.trim() ?? "";
  return q.length >= 1 && q.length <= 40 && /^[\p{L}\p{N} .&'-]+$/u.test(q) ? q : null;
}
