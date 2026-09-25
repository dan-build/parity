import { runCheck } from "@/lib/run-check";

// GET /api/check?q=NVDA → { ok, verdict, reasons, wrappers, evidence, gaps, mood, mode, ... }
export async function GET(request: Request) {
  const { status, body } = await runCheck(new URL(request.url).searchParams.get("q") ?? "");
  return Response.json(body, { status });
}
