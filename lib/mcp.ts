/**
 * Parity as an MCP server: one read-only tool, `check_rwa`, that answers the same
 * question as the page ("is this token actually the thing, at a fair price, and can I
 * sell it later?") for an AI agent or wallet. It runs the same runCheck() + present()
 * as the site, so the two can never disagree.
 *
 * Transport-agnostic: scripts/mcp.ts connects it over stdio; tests use an in-memory pair.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { answerLine, dayLabel, present } from "./present";
import { runCheck } from "./run-check";

/** Where share links point. Override with PARITY_URL (e.g. a preview deploy). */
export const PARITY_URL = process.env.PARITY_URL ?? "https://parity-gray-one.vercel.app";

const verdict = z.enum(["FAIR", "RICH", "THIN", "GHOST"]);

export const checkOutput = {
  query: z.string(),
  asset: z.object({ name: z.string(), symbol: z.string(), rwa_id: z.number() }),
  verdict,
  answer: z.string().describe('One line: "best way in · XAUt", "no easy way out", "no price to trust" or "nothing to hold"'),
  summary: z.string().describe("The verdict in a sentence, e.g. 'Fair: if you pick the right token.'"),
  reasons: z.array(z.string()),
  reference: z
    .object({ kind: z.enum(["spot", "tokens"]), price_usd: z.number().nullable() })
    .describe("What premiums are measured against: CMC's metal spot price, or the tokens' typical price (stocks; CMC has no share prices)"),
  best_way_in: z
    .object({ token: z.string(), issuer: z.string().nullable(), chain: z.string().nullable(), contract: z.string().nullable() })
    .nullable()
    .describe("null when nothing is recommended (no token trades, or none can be trusted)"),
  tokens: z.array(
    z.object({
      token: z.string().describe("Symbol, plus issuer when two tokens share a symbol"),
      crypto_id: z.number(),
      issuer: z.string().nullable(),
      chain: z.string().nullable(),
      price_usd: z.number().nullable().describe("Per ounce for metals (per-gram quotes are converted), per share for stocks"),
      premium_pct: z.number().nullable().describe("Against `reference`: spot for metals, the tokens' typical price for stocks"),
      volume_24h_usd: z.number().nullable(),
      exit: z.string().describe("How easy it is to sell later: Deep, Good, Some, Thin or None"),
      unit_source: z.enum(["registry", "inferred"]).nullable().describe("Where the token's unit came from: Parity's open registry, price inference, or nowhere (priced as quoted)"),
      redemption: z
        .object({
          route: z.enum(["issuer_kyc", "issuer", "none"]).describe("issuer_kyc: redeem with the issuer after its KYC; issuer: through the issuer, on its terms; none: can't be redeemed for the asset"),
          summary: z.string().describe("The issuer's terms, from its own page"),
          source_url: z.string().describe("The issuer's page"),
        })
        .nullable()
        .describe("How a holder gets the real asset, from Parity's open registry; null = nothing on file (unknown, not 'no')"),
      verdict,
    }),
  ),
  cant_tell: z.array(z.string()).describe("What the data can't tell you, stated rather than guessed"),
  data: z.object({
    source: z.enum(["live", "saved"]),
    as_of: z.string().nullable(),
    notice: z.string().nullable().describe("Set whenever the data isn't live: why, and from when. Show it to the user."),
    calls: z.number(),
    method_version: z.string().describe("METHOD.md version that produced this verdict"),
  }),
  share_url: z.string(),
  disclaimer: z.string(),
};

const round = (n: number | null, digits: number) => (n === null ? null : Math.round(n * 10 ** digits) / 10 ** digits);

type CheckOutput = { [K in keyof typeof checkOutput]: z.infer<(typeof checkOutput)[K]> };

/** Run one check and shape it for an agent. `null` with a message when there's no answer. */
export async function checkRwa(
  query: string,
  siteUrl: string = PARITY_URL,
): Promise<{ ok: true; out: CheckOutput } | { ok: false; status: number; error: string; message: string; suggestions: { symbol: string; name: string }[] }> {
  const { status, body } = await runCheck(query);
  if (!body.ok) {
    const suggestions = body.suggestions ?? [];
    const hint = suggestions.length ? ` Did you mean: ${suggestions.map((s) => `${s.symbol} (${s.name})`).join(", ")}?` : "";
    return { ok: false, status, error: body.error, message: `${body.message}${hint}`, suggestions };
  }
  const view = present(body);
  const best = view.route ? body.wrappers.find((w) => w.crypto_id === body.headline_crypto_id) ?? null : null;
  const out: CheckOutput = {
    query: body.query,
    asset: { name: body.asset.name, symbol: body.asset.symbol, rwa_id: body.asset.rwa_id },
    verdict: body.verdict,
    answer: answerLine(body),
    summary: `${view.headline.word}: ${view.headline.sub}`,
    reasons: view.reasons.map((r) => `${r.strong}${r.rest}`.trim()),
    // null whenever the page wouldn't show one (e.g. KLAC: a midpoint of two prices 10× apart).
    reference: {
      kind: body.reference.method === "metal_spot" ? "spot" : "tokens",
      price_usd: view.instrument.reference.price === "—" ? null : round(body.reference.price_usd, 2),
    },
    best_way_in: best ? { token: best.display, issuer: best.issuer_name, chain: best.chain, contract: best.contract } : null,
    tokens: body.wrappers.map((w) => ({
      token: w.display,
      crypto_id: w.crypto_id,
      issuer: w.issuer_name,
      chain: w.chain,
      price_usd: round(w.price_usd, 2),
      premium_pct: round(w.premium_pct, 2),
      volume_24h_usd: round(w.volume_24h, 0),
      exit: view.list.rows.find((r) => r.id === w.crypto_id)?.exit.word ?? "None",
      unit_source: w.unit_source,
      redemption: ((f) => (f ? { route: f.route, summary: f.summary, source_url: f.url } : null))(body.redemption?.find((f) => f.crypto_id === w.crypto_id)),
      verdict: w.verdict,
    })),
    cant_tell: view.gaps.map((g) => `${g.title}: ${g.sub}`),
    data: { source: body.mode === "live" ? "live" : "saved", as_of: body.data_as_of, notice: view.notice ?? (body.mode === "fixture" && body.data_as_of ? `Saved CoinMarketCap data from ${dayLabel(body.data_as_of)}, not live prices.` : null), calls: body.evidence.length, method_version: body.method_version },
    share_url: `${siteUrl}/?q=${encodeURIComponent(body.asset.symbol)}`,
    disclaimer: "Not financial advice. Prices from CoinMarketCap.",
  };
  return { ok: true, out };
}

/** Short human-readable text for clients that only show text content. */
export function describe(o: CheckOutput): string {
  return [
    `${o.asset.name} (${o.asset.symbol}): ${o.verdict}, ${o.answer}.`,
    o.summary,
    ...o.reasons.map((r) => `- ${r}`),
    `${o.tokens.length} tokens checked (${o.data.source} data${o.data.as_of ? `, as of ${o.data.as_of}` : ""}). ${o.share_url}`,
    o.disclaimer,
  ].join("\n");
}

/** siteUrl: where share links point; the hosted endpoint passes its own origin. */
export function createParityServer({ siteUrl = PARITY_URL }: { siteUrl?: string } = {}): McpServer {
  const server = new McpServer({ name: "parity", version: "1.0.0" });
  server.registerTool(
    "check_rwa",
    {
      title: "Check a tokenised real-world asset",
      description:
        "Is this token actually the thing, at a fair price, and can I sell it later? Give a ticker or name " +
        "(GOLD, NVDA, SPY, silver, UNH…). Returns every token that claims to be that asset, each one's price " +
        "against the others (units converted), how easy it is to sell, one verdict (FAIR, RICH, THIN or GHOST), " +
        "the best way in if there is one, and what the data can't tell. Informational, not financial advice: " +
        "never present the result as a recommendation to buy.",
      inputSchema: {
        query: z
          .string()
          .trim()
          .min(1)
          .max(40)
          .regex(/^[\p{L}\p{N} .&'-]+$/u, "letters, digits, spaces and . & ' - only (same rule as the JSON API)")
          .describe("Ticker or asset name, e.g. GOLD, NVDA, silver"),
      },
      outputSchema: checkOutput,
      annotations: { readOnlyHint: true, openWorldHint: true, idempotentHint: true },
    },
    async ({ query }) => {
      const r = await checkRwa(query, siteUrl);
      if (!r.ok) return { isError: true, content: [{ type: "text", text: r.message }] };
      return { structuredContent: r.out, content: [{ type: "text", text: describe(r.out) }] };
    },
  );
  return server;
}
