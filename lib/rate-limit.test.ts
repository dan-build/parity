import { describe, expect, it } from "vitest";
import { clientKey, createLimiter, networkOf, validQuery } from "./rate-limit";

describe("rate limiter", () => {
  it("allows `limit` hits per window per client, then says when to retry", () => {
    let t = 0;
    const limit = createLimiter({ limit: 3, windowMs: 60_000 }, () => t);
    expect([limit("a"), limit("a"), limit("a")].every((r) => r.ok)).toBe(true);
    t = 20_000;
    expect(limit("a")).toEqual({ ok: false, retryAfter: 40 });
    expect(limit("b").ok).toBe(true); // other clients are unaffected
    t = 60_001;
    expect(limit("a").ok).toBe(true); // the window slides
  });
});

describe("clientKey", () => {
  it("uses the first x-forwarded-for address, then x-real-ip", () => {
    expect(clientKey(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientKey(new Headers({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientKey(new Headers())).toBe("unknown");
  });
});

describe("validQuery", () => {
  it("accepts tickers and names", () => {
    for (const q of ["GOLD", "nvda", "S&P 500", "silver", "BRK.B", " KLAC "]) expect(validQuery(q)).toBe(q.trim());
  });
  it("rejects empty, long and odd input", () => {
    for (const q of [null, "", "   ", "x".repeat(41), "<script>", "a;drop", "q=1"]) expect(validQuery(q)).toBeNull();
  });
});

describe("networkOf", () => {
  it("keys IPv6 clients by their /64, so rotating addresses doesn't buy a new budget", () => {
    expect(networkOf("2001:db8:1:2:aaaa::1")).toBe("2001:db8:1:2::/64");
    expect(networkOf("2001:db8:1:2:bbbb:cccc:dddd:eeee")).toBe("2001:db8:1:2::/64");
    expect(networkOf("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(networkOf("1.2.3.4")).toBe("1.2.3.4");
  });
});
