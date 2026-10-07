import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { clearCmcCache } from "@/lib/cmc";
import { checkOutput } from "@/lib/mcp";
import { GET, OPTIONS } from "./route";

let ip = 0;
/** Each test gets its own client address, so rate limits don't leak between tests. */
const call = (q: string | null, from = `10.0.0.${++ip}`) =>
  GET(new Request(`http://test/api/v1/check${q === null ? "" : `?q=${encodeURIComponent(q)}`}`, { headers: { "x-forwarded-for": from } }));

const contract = z.object({ ok: z.literal(true), api_version: z.literal("1"), ...checkOutput }).strict();

beforeEach(() => {
  clearCmcCache();
  vi.stubEnv("PARITY_PUBLIC_API", "on");
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/v1/check", () => {
  it("is off unless PARITY_PUBLIC_API=on", async () => {
    vi.stubEnv("PARITY_PUBLIC_API", "");
    const res = await call("GOLD");
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, error: "public_api_disabled" });
  });

  it("returns the documented contract, cached by the CDN, with CORS", async () => {
    const res = await call("GOLD");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(contract.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({ verdict: "FAIR", answer: "best way in · XAUt", reference: { kind: "spot" } });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toMatch(/s-maxage=60/);
    expect(JSON.stringify(body)).not.toMatch(/\bbuy(s|ing)?\b/i);
  });

  it("answers every demo verdict", async () => {
    for (const [q, v] of [["UNH", "RICH"], ["SILVER", "THIN"], ["KLAC", "GHOST"]] as const) {
      expect((await (await call(q)).json()).verdict).toBe(v);
    }
  });

  it("rejects bad input with 400 and unknown assets with 404 + suggestions, never cached", async () => {
    const bad = await call("<script>");
    expect(bad.status).toBe(400);
    const missing = await call("zzzz");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ ok: false, error: "not_found", suggestions: expect.any(Array) });
    expect(missing.headers.get("cache-control")).toBe("no-store");
    expect((await call(null)).status).toBe(400);
  });

  it("rate limits each client: 30 a minute, then 429 with Retry-After", async () => {
    const who = "10.9.9.9";
    for (let i = 0; i < 30; i++) expect((await call("<bad>", who)).status).toBe(400); // cheap requests still count
    const res = await call("GOLD", who);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await call("GOLD", "10.9.9.10")).status).toBe(200); // someone else is fine
  });

  it("answers CORS preflight", () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toContain("GET");
  });
});
