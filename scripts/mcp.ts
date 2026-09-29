/**
 * Parity MCP server over stdio. Point an MCP client (Claude Desktop, Cursor, Claude Code…)
 * at it:  npx tsx /path/to/parity/scripts/mcp.ts
 *
 * Saved data by default (no key, no credits). For live data put CMC_API_KEY and
 * PARITY_DATA_MODE=live in .env.local (or the client's env). stdout carries the protocol,
 * so nothing here may print to it.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
// Relative on purpose: tsx resolves the "@/" alias from the cwd, and clients start us from anywhere.
import { createParityServer } from "../lib/mcp";

// Clients start servers from anywhere; fixtures/ and .env.local are found from the repo root.
process.chdir(resolve(__dirname, ".."));
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

createParityServer()
  .connect(new StdioServerTransport())
  .catch((err) => {
    console.error("parity mcp failed to start:", err);
    process.exit(1);
  });
