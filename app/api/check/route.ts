import { check } from "@/lib/check";
import { createCmcClient, liveTransport } from "@/lib/cmc";

// GET /api/check?q=NVDA → { verdict, reasons, wrappers, evidence, gaps, ... }
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return Response.json({ error: "missing_query", message: "Add ?q= with a ticker, e.g. ?q=NVDA" }, { status: 400 });

  const apiKey = process.env.CMC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "no_api_key", message: "CMC_API_KEY isn't set on the server." }, { status: 503 });
  }

  const client = createCmcClient({ transport: liveTransport(apiKey), source: "live" });
  const outcome = await check(q, client);

  switch (outcome.kind) {
    case "ok":
      return Response.json(outcome.result);
    case "not_found":
      return Response.json(
        { error: "not_found", message: `We couldn't find “${outcome.query}”.`, suggestions: outcome.suggestions, evidence: outcome.evidence },
        { status: 404 },
      );
    case "error":
      return Response.json({ error: "upstream_error", message: outcome.message, evidence: outcome.evidence }, { status: 502 });
  }
}
