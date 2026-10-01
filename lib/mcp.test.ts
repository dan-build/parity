import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearCmcCache } from "./cmc";
import { createParityServer } from "./mcp";

type Out = {
  verdict: string;
  answer: string;
  best_way_in: { token: string; chain: string | null; contract: string | null } | null;
  tokens: { token: string; verdict: string }[];
  data: { source: string; calls: number };
  share_url: string;
  reasons: string[];
};

let client: Client;
const call = async (query: string) => client.callTool({ name: "check_rwa", arguments: { query } });

beforeAll(async () => {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createParityServer().connect(a);
  client = new Client({ name: "eval", version: "0" });
  await client.connect(b); // the client validates structuredContent against the tool's outputSchema
});
beforeEach(() => clearCmcCache());

describe("check_rwa (in memory)", () => {
  it("is listed as one read-only tool with input and output schemas", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(["check_rwa"]);
    expect(tools[0]).toMatchObject({ annotations: { readOnlyHint: true }, inputSchema: { required: ["query"] } });
    expect(tools[0].outputSchema).toBeDefined();
    expect(tools[0].description).toMatch(/not financial advice/i);
  });

  it.each([
    ["GOLD", "FAIR", "best way in · XAUt"],
    ["UNH", "RICH", "best way in · UNHon"],
    ["SILVER", "THIN", "no easy way out"],
    ["KLAC", "GHOST", "no price to trust"],
    ["MS", "GHOST", "nothing to hold"],
  ])("%s → %s, %s", async (q, verdict, answer) => {
    const r = await call(q);
    expect(r.isError).toBeFalsy();
    const o = r.structuredContent as Out;
    expect(o).toMatchObject({ verdict, answer, data: { source: "saved" } });
    expect(o.best_way_in === null).toBe(!answer.startsWith("best way in"));
  });

  it("names the best way in with its chain and contract, and links back to the site", async () => {
    const o = (await call("GOLD")).structuredContent as Out;
    expect(o.best_way_in).toMatchObject({ token: "XAUt", chain: "Ethereum", contract: expect.stringMatching(/^0x/) });
    expect(o.share_url).toMatch(/\/\?q=GOLD$/);
    expect(o.tokens).toHaveLength(7);
    expect((o.data as { method_version?: string }).method_version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("reads cleanly: a colon after the verdict word, prices in cents, volumes in dollars", async () => {
    const o = (await call("SILVER")).structuredContent as Out & { summary: string; tokens: { price_usd: number | null; volume_24h_usd: number | null }[] };
    expect(o.summary).toBe("Thin: not much market to sell into.");
    for (const t of o.tokens) {
      if (t.price_usd !== null) expect(String(t.price_usd)).toMatch(/^\d+(\.\d{1,2})?$/);
      if (t.volume_24h_usd !== null) expect(Number.isInteger(t.volume_24h_usd)).toBe(true);
    }
  });

  it("keeps colliding symbols apart", async () => {
    const o = (await call("NVDA")).structuredContent as Out;
    const nvda = o.tokens.filter((t) => t.token.startsWith("NVDA ("));
    expect(nvda.length).toBe(2);
    expect(new Set(nvda.map((t) => t.token)).size).toBe(2);
  });

  it("resolves names as well as tickers", async () => {
    expect(((await call("silver")).structuredContent as Out).verdict).toBe("THIN");
  });

  it("returns a tool error with suggestions for an unknown asset, never a crash", async () => {
    const r = await call("zzzz");
    expect(r.isError).toBe(true);
    expect((r.content as { text: string }[])[0].text).toMatch(/couldn't find/i);
  });

  it("never tells an agent to buy", async () => {
    for (const q of ["GOLD", "UNH", "SILVER", "KLAC"]) {
      const r = await call(q);
      expect(JSON.stringify(r)).not.toMatch(/\bbuy\b(?! it)/i);
    }
  });
});

describe("check_rwa over stdio (the real script)", () => {
  let stdio: Client;
  beforeAll(async () => {
    // Started from another directory, the way desktop clients start servers.
    const transport = new StdioClientTransport({
      command: join(process.cwd(), "node_modules/.bin/tsx"),
      args: [join(process.cwd(), "scripts/mcp.ts")],
      cwd: tmpdir(),
      env: { ...process.env, PARITY_DATA_MODE: "fixture" } as Record<string, string>,
      stderr: "pipe",
    });
    stdio = new Client({ name: "eval-stdio", version: "0" });
    await stdio.connect(transport);
  }, 30_000);
  afterAll(async () => stdio?.close());

  it("answers UNH as RICH from saved data", async () => {
    const r = await stdio.callTool({ name: "check_rwa", arguments: { query: "UNH" } });
    expect((r.structuredContent as Out).verdict).toBe("RICH");
    expect((r.content as { text: string }[])[0].text).toMatch(/^UnitedHealth Group Inc \(UNH\): RICH/);
  }, 30_000);
});
