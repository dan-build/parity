/**
 * GET /api/v1/schema: the JSON Schema of a /api/v1/check success response, generated from the
 * same definition responses are validated against (lib/mcp.ts checkOutput), so it can't drift.
 * Costs no credits, so it's served even when the public API is off.
 */
import { z } from "zod";
import { checkOutput } from "@/lib/mcp";
import { CORS, PUBLIC_API_VERSION } from "@/lib/public-api";

export const dynamic = "force-static";

export function GET() {
  const response = z.object({ ok: z.literal(true), api_version: z.literal(PUBLIC_API_VERSION), ...checkOutput });
  const schema = { $id: `parity/api/v${PUBLIC_API_VERSION}/check`, title: "Parity check result", ...z.toJSONSchema(response) };
  return Response.json(schema, { headers: { ...CORS, "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
}
