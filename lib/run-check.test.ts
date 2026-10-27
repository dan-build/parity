import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCmcCache, createCmcClient, type Transport } from "./cmc";
import { budgeted, createClient, fixtureClient, type DataSource } from "./data-source";
import { present } from "./present";
import { isRateLimited, runCheckWith } from "./run-check";

/** A "live" client whose every call gets the same answer. */
const liveAnswering = (status: number, errorCode: string | number, message: string): DataSource => {
  const transport: Transport = async () => ({ status, body: { status: { error_code: errorCode, error_message: message, credit_count: 0 } } });
  return { mode: "live", fallback: null, client: createCmcClient({ transport, source: "live" }) };
};

beforeEach(() => clearCmcCache());
afterEach(() => vi.unstubAllEnvs());

describe("falling back to saved data", () => {
  it("answers from fixtures when CoinMarketCap rate-limits, and says so", async () => {
    const { status, body } = await runCheckWith("GOLD", liveAnswering(429, "1008", "minute rate limit"), fixtureClient);
    expect(status).toBe(200);
    if (!body.ok) throw new Error(body.message);
    expect(body).toMatchObject({ mode: "fixture", fallback: "rate_limited", verdict: "FAIR" });
    expect(present(body).notice).toMatch(/^CoinMarketCap is limiting requests right now, so this is saved data from \d+ \w{3} \d{4}\.$/);
  });

  it("answers from fixtures when CoinMarketCap fails", async () => {
    const { body } = await runCheckWith("NVDA", liveAnswering(500, 500, "The system is busy"), fixtureClient);
    expect(body).toMatchObject({ ok: true, mode: "fixture", fallback: "unavailable" });
  });

  it("uses saved data when live mode has no key", async () => {
    vi.stubEnv("PARITY_DATA_MODE", "live");
    vi.stubEnv("CMC_API_KEY", "");
    const source = createClient();
    expect(source).toMatchObject({ mode: "fixture", fallback: "no_key" });
    const { body } = await runCheckWith("GOLD", source, fixtureClient);
    expect(body.ok && present(body).notice).toMatch(/^Live data isn't set up here/);
  });

  it("says try again when rate-limited on an asset we haven't saved", async () => {
    const { status, body } = await runCheckWith("QCOM", liveAnswering(429, "1008", "minute rate limit"), fixtureClient);
    expect(status).toBe(503);
    expect(body).toMatchObject({ ok: false, message: expect.stringMatching(/Try again in a minute/) });
  });

  it("never falls back in fixture mode, and a plain result has no notice", async () => {
    const { body } = await runCheckWith("GOLD", createClient("fixture"), fixtureClient);
    expect(body.ok && body.fallback).toBeNull();
    expect(body.ok && present(body).notice).toBeNull();
  });

  it("recognises CMC's rate-limit codes", () => {
    expect(isRateLimited({ status: 429, error_code: null })).toBe(true);
    expect(isRateLimited({ status: 403, error_code: "1010" })).toBe(true);
    expect(isRateLimited({ status: 403, error_code: "1006" })).toBe(false);
  });
});

describe("the per-instance live budget", () => {
  it("passes calls through until the minute's budget is used, then answers as a rate limit", async () => {
    let t = 0;
    let real = 0;
    const inner: Transport = async () => (real++, { status: 200, body: { status: { error_code: 0 } } });
    const tx = budgeted(inner, 3, () => t);
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await tx({ path: "/x", params: {} })).status);
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
    expect(real).toBe(3);
    t = 60_000;
    expect((await tx({ path: "/x", params: {} })).status).toBe(200);
  });

  it("over budget, a live check falls back to saved data and says so", async () => {
    const exhausted = budgeted(async () => ({ status: 200, body: {} }), 0);
    const source: DataSource = { mode: "live", fallback: null, client: createCmcClient({ transport: exhausted, source: "live" }) };
    const { body } = await runCheckWith("GOLD", source, fixtureClient);
    expect(body).toMatchObject({ ok: true, mode: "fixture", fallback: "rate_limited" });
  });
});
