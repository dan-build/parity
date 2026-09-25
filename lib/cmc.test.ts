import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCmcCache,
  createCmcClient,
  liveTransport,
  num,
  trimForEvidence,
  type CmcRequest,
  type Transport,
} from "./cmc";
import { fixtureTransport } from "./cmc-fixtures";

const NVDAX_SOLANA = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";

function spy(res: { status: number; body: unknown }) {
  const calls: CmcRequest[] = [];
  const t: Transport = async (req) => {
    calls.push(req);
    return res;
  };
  return { t, calls };
}

beforeEach(() => clearCmcCache());
afterEach(() => vi.unstubAllGlobals());

describe("num", () => {
  it("parses long decimal strings and rejects junk", () => {
    expect(num("16329735.502696241094590555")).toBeCloseTo(16329735.5027, 3);
    expect(num(42)).toBe(42);
    expect(num(undefined)).toBeNull();
    expect(num("")).toBeNull();
    expect(num("abc")).toBeNull();
  });
});

describe("dexTokenPools", () => {
  it("parses string numbers from fixtures and keeps missing liqUsd as null", async () => {
    const client = createCmcClient({ transport: fixtureTransport("fixtures"), source: "fixture" });
    const r = await client.dexTokenPools("solana", NVDAX_SOLANA);
    if (!r.ok) throw new Error(r.message);
    expect(r.data.length).toBeGreaterThan(0);
    for (const p of r.data) {
      expect(p.liquidity_usd === null || typeof p.liquidity_usd === "number").toBe(true);
      expect(p.volume_24h_usd === null || typeof p.volume_24h_usd === "number").toBe(true);
    }
    expect(r.data.some((p) => p.liquidity_usd === null)).toBe(true);
    expect(r.data.some((p) => typeof p.liquidity_usd === "number")).toBe(true);
  });

  it("sends CMC's bnb platform slug as bsc", async () => {
    const { t, calls } = spy({ status: 200, body: { data: [] } });
    await createCmcClient({ transport: t }).dexTokenPools("bnb", "0xabc");
    expect(calls[0].params.platform).toBe("bsc");
  });
});

describe("errors", () => {
  it("returns ok:false on a 403 instead of throwing", async () => {
    const { t } = spy({
      status: 403,
      body: { status: { error_code: "1006", error_message: "Your API Key subscription plan doesn't support this endpoint." } },
    });
    const client = createCmcClient({ transport: t });
    const r = await client.get("/v5/real-world-assets/market-pairs/list", { rwa_id: 2 });
    expect(r).toMatchObject({ ok: false, status: 403, errorCode: "1006" });
    expect(client.evidence[0]).toMatchObject({ status: 403, error_code: "1006" });
  });

  it("returns ok:false on a network error", async () => {
    const client = createCmcClient({
      transport: async () => {
        throw new Error("ECONNRESET");
      },
    });
    const r = await client.rwaMap();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/ECONNRESET/);
  });
});

describe("cache", () => {
  it("serves an identical request from cache within 60s and logs it as cached", async () => {
    let t = 1_000;
    const { t: transport, calls } = spy({ status: 200, body: { data: { rwa_assets: [] } } });
    const client = createCmcClient({ transport, now: () => t });
    await client.rwaMap();
    t += 30_000;
    await client.rwaMap();
    expect(calls).toHaveLength(1);
    expect(client.evidence.map((e) => e.cached)).toEqual([false, true]);
    t += 31_000;
    await client.rwaMap();
    expect(calls).toHaveLength(2);
  });

  it("doesn't cache errors", async () => {
    const { t, calls } = spy({ status: 500, body: {} });
    const client = createCmcClient({ transport: t });
    await client.rwaMap();
    await client.rwaMap();
    expect(calls).toHaveLength(2);
  });

  it("uses the same cache key regardless of crypto_id order", async () => {
    const { t, calls } = spy({ status: 200, body: { data: {} } });
    const client = createCmcClient({ transport: t });
    await client.cryptoInfo([3, 1, 2]);
    await client.cryptoInfo([2, 3, 1]);
    expect(calls).toHaveLength(1);
    expect(calls[0].params.id).toBe("1,2,3");
  });
});

describe("evidence", () => {
  it("never contains the API key", async () => {
    const KEY = "test-key-9f8e7d6c5b4a";
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>)["X-CMC_PRO_API_KEY"]).toBe(KEY);
      return new Response(JSON.stringify({ status: { error_code: "0", credit_count: 1 }, data: { rwa_assets: [] } }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = createCmcClient({ transport: liveTransport(KEY) });
    await client.rwaMap();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).not.toContain(KEY);
    expect(JSON.stringify(client.evidence)).not.toContain(KEY);
    expect(client.evidence[0]).toMatchObject({ endpoint: "/v5/real-world-assets/map", status: 200, credit_count: 1 });
  });

  it("trims large bodies", () => {
    const t = trimForEvidence({ list: Array.from({ length: 10 }, (_, i) => i), s: "x".repeat(500) }) as {
      list: unknown[];
      s: string;
    };
    expect(t.list).toEqual([0, 1, 2, "… 7 more"]);
    expect(t.s.length).toBeLessThanOrEqual(201);
  });
});
