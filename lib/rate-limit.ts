/**
 * Protects CoinMarketCap credits on the site's own paths (/api/check, server-rendered ?q=
 * pages, /api/og): a per-client rate limit and input validation.
 *
 * In-memory: on serverless every instance keeps its own counts, so this is a guard, not a
 * guarantee. lib/data-source.ts adds a per-instance cap on live CMC calls, and the CMC client
 * shares simultaneous identical requests and caches answers for 60s.
 */

/** Checks per client per minute across the site (a live check costs ~5–7 credits). */
export const LIMITS = {
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

/** One limiter for the whole site (page renders, /api/check and share images share a budget per client). */
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

/** A ticker or asset name: 1–40 letters, digits, spaces and . & ' - . Null if invalid. */
export function validQuery(raw: string | null): string | null {
  const q = raw?.trim() ?? "";
  return q.length >= 1 && q.length <= 40 && /^[\p{L}\p{N} .&'-]+$/u.test(q) ? q : null;
}
