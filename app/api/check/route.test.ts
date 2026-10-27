import { describe, expect, it } from "vitest";
import { GET } from "./route";

const call = (q: string, from: string) => GET(new Request(`http://test/api/check?q=${q}`, { headers: { "x-forwarded-for": from } }));

describe("GET /api/check (the page's own endpoint)", () => {
  it("is always on, and limits each client to 60 checks a minute with a friendly message", async () => {
    const who = "10.3.0.1";
    for (let i = 0; i < 60; i++) expect((await call("", who)).status).toBe(400); // empty query: cheap, still counted
    const res = await call("GOLD", who);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ ok: false, error: "rate_limited", message: expect.stringMatching(/^Lots of checks from you/) });
    expect((await call("GOLD", "10.3.0.2")).status).toBe(200);
  });
});
