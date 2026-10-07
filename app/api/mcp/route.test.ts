import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCmcCache } from "@/lib/cmc";
import { DELETE, GET, OPTIONS, POST } from "./route";

type Out = { verdict: string; answer: string; reference: { kind: string }; best_way_in: unknown };

let ip = 0;
const post = (body: string, from: string) =>
  new Request("http://test/api/mcp", { method: "POST", body, headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "x-forwarded-for": from } });
/** A real MCP client whose HTTP goes straight into the route handlers. */
async function connect(from = `10.1.0.${++ip}`) {
  const fetchToRoute = async (url: string | URL, init?: RequestInit) => {
    const req = new Request(url, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), "x-forwarded-for": from } });
    const method = (init?.method ?? "GET").toUpperCase();
    return method === "POST" ? POST(req) : method === "DELETE" ? DELETE() : GET();
  };
  const client = new Client({ name: "eval-http", version: "0" });
  await client.connect(new StreamableHTTPClientTransport(new URL("http://test/api/mcp"), { fetch: fetchToRoute }));
  return client;
}

beforeEach(() => {
  clearCmcCache();
  vi.stubEnv("PARITY_PUBLIC_API", "on");
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/mcp (hosted MCP, stateless)", () => {
  it("serves check_rwa to a real MCP client, schema-validated", async () => {
    const client = await connect();
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual(["check_rwa"]);
    const r = await client.callTool({ name: "check_rwa", arguments: { query: "GOLD" } });
    expect(r.structuredContent as Out).toMatchObject({ verdict: "FAIR", answer: "best way in · XAUt", reference: { kind: "spot" } });
    const ghost = await client.callTool({ name: "check_rwa", arguments: { query: "KLAC" } });
    expect(ghost.structuredContent as Out).toMatchObject({ verdict: "GHOST", answer: "no price to trust", best_way_in: null });
    await client.close();
  });

  it("returns a tool error, not a crash, for an unknown asset", async () => {
    const client = await connect();
    const r = await client.callTool({ name: "check_rwa", arguments: { query: "zzzz" } });
    expect(r.isError).toBe(true);
    await client.close();
  });

  it("is off unless PARITY_PUBLIC_API=on", async () => {
    vi.stubEnv("PARITY_PUBLIC_API", "");
    const res = await POST(new Request("http://test/api/mcp", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }));
    expect(res.status).toBe(503);
  });

  it("refuses GET/DELETE (stateless) and over-limit clients", async () => {
    expect(GET().status).toBe(405);
    expect(DELETE().status).toBe(405);
    const who = "10.2.0.2";
    for (let i = 0; i < 60; i++) await POST(post("{}", who));
    expect((await POST(post("{}", who))).status).toBe(429);
  });

  it("caps the body at 64 KB even when it's sent in chunks with no length", async () => {
    expect((await POST(post("x".repeat(65 * 1024), "10.2.1.1"))).status).toBe(413);
    const chunk = new TextEncoder().encode("x".repeat(64 * 1024));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (sent++ < 32) c.enqueue(chunk); // 2 MB, no content-length
        else c.close();
      },
    });
    const chunked = new Request("http://test/api/mcp", { method: "POST", body: stream, duplex: "half", headers: { "x-forwarded-for": "10.2.1.2" } } as RequestInit);
    expect((await POST(chunked)).status).toBe(413);
  });

  it("refuses batches: 100 tool calls can't ride on one request", async () => {
    const batch = Array.from({ length: 100 }, (_, i) => ({ jsonrpc: "2.0", id: i, method: "tools/call", params: { name: "check_rwa", arguments: { query: "GOLD" } } }));
    const res = await POST(post(JSON.stringify(batch), "10.2.2.1"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "batch_not_supported" });
    expect((await POST(post("{not json", "10.2.2.2"))).status).toBe(400);
  });

  it("validates the query like the JSON API, and links back to the deployment it was called on", async () => {
    const client = await connect();
    const bad = await client.callTool({ name: "check_rwa", arguments: { query: "<bad>" } });
    expect(bad.isError).toBe(true);
    expect(JSON.stringify(bad.content)).toMatch(/letters, digits, spaces/);
    const r = (await client.callTool({ name: "check_rwa", arguments: { query: "GOLD" } })).structuredContent as { share_url: string; data: { notice: string | null } };
    expect(r.share_url).toBe("http://test/?q=GOLD");
    expect(r.data.notice).toMatch(/^Saved CoinMarketCap data from \d+ \w{3} \d{4}, not live prices\.$/);
    const klac = (await client.callTool({ name: "check_rwa", arguments: { query: "KLAC" } })).structuredContent as { reference: { price_usd: number | null } };
    expect(klac.reference.price_usd).toBeNull(); // no midpoint of prices 10× apart
    await client.close();
  });

  it("answers CORS preflight with the MCP headers allowed", () => {
    expect(OPTIONS().headers.get("access-control-allow-headers")).toContain("mcp-protocol-version");
  });
});
