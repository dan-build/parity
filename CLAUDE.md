# PARITY — project brief for Claude Code

## What we're building
A one-question tool for a regular person about to buy a tokenised real-world asset
(tokenised NVDA, gold, SPY, etc.) on-chain:

> "Is this token actually the thing, at a fair price, and can I sell it later?"

Type a ticker → get a verdict card (FAIR / RICH / THIN / GHOST) in plain English,
with the evidence one click away, and a share image that looks good on X.

Persona: a crypto-native retail buyer, NOT a fund desk. Other entries target
allocators with dense terminals. We win on clarity, craft and shareability.

Hackathon: Build with CMC (DoraHacks), Real World Assets track.
Hard deadline: Wed 30 Sep 2026, 23:59 UTC. Treat 29 Sep night as the real deadline.

## Scope (in priority order — never start a lower item before the higher one works)
1. Resolve query → rwa_id (never trust symbols; collisions are real)
2. Wrapper list for that rwa_id: issuer, chain, price, premium vs average tokenised price
3. Exit check per wrapper: volume / tracked market / DEX pool depth where the key allows
4. Verdict engine: pure function, unit-tested, returns verdict + 3–6 plain-English reasons
5. UI: search → verdict card → wrapper table → "Evidence" drawer (endpoint, params, timestamp, trimmed JSON)
6. "What the data can't tell you" panel (gaps we hit, shown in the UI)
7. Share image per verdict (Open Graph image at /api/og?q=NVDA) + shareable URL
8. Fixture mode: if no key or rate-limited, serve saved JSON responses so the demo never breaks
9. STRETCH: market-stress badge (Fear & Greed and/or derivatives liquidations, if the key allows)
10. STRETCH: tiny MCP server exposing `check_rwa(query)` using the same engine

Out of scope: x402, user accounts, databases, portfolio tracking, charts for decoration.

## Stack
- Next.js (App Router) + TypeScript + Tailwind, deployed on Vercel
- All CMC calls happen server-side in route handlers. The key lives in `.env.local`
  as `CMC_API_KEY` and is NEVER sent to the browser or committed.
- `lib/cmc.ts`: typed client, one function per endpoint, in-memory cache 60s,
  logs every call into an evidence array returned with the response
- `lib/verdict.ts`: pure scoring logic, no fetching, covered by tests
- `fixtures/`: real captured responses used by fixture mode and tests

## CMC API notes (verify each with the probe script before relying on it)
- Base URL: https://pro-api.coinmarketcap.com, header `X-CMC_PRO_API_KEY`
- RWA endpoints live under /v5/real-world-assets/* (map, info, quotes/latest, issuers...)
- /v1/key/info tells us the plan and credits left
- /v1/dex/token/pools may give on-chain depth for wrapper tokens
- Some endpoints may 403 on the hackathon Startup tier → degrade gracefully and
  show it in the "can't tell you" panel, never crash

## Design principles
- One screen, one answer. The verdict is the hero; everything else supports it.
- Calm, confident, typographic. Generous spacing, one accent colour per verdict state.
- Numbers use tabular figures. Premiums shown as $ and %, never bps by default.
- Motion is small and purposeful (verdict settles in, rows stagger once). No spinners
  longer than needed; use skeletons that match the final layout.
- Works beautifully on a phone. The share image must be legible at X's thumbnail size.
- Plain-English copy. No jargon a first-time buyer wouldn't know.

## Working rules for Claude
- Before any multi-file change, propose a short plan and wait for approval.
- Keep changes small; after each step, tell me exactly how to check it works.
- Never invent API fields. If unsure, read `fixtures/` or run the probe script.
- Not financial advice: show a one-line disclaimer on the card.
