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

## Probe findings (25 Sep 2026, Startup key; don't re-probe, read `fixtures/`)
`npm run probe` (scripts/probe.ts) runs the engine's real `check()` for GOLD and NVDA through
a recording transport. It saves every response to `fixtures/` and adds it to `fixtures/_index.json`
(request key → file), which `fixtureTransport` in lib/cmc-fixtures.ts replays for tests. It also
writes a per-call log to `fixtures/_probe-summary.json`. One run costs about 17 credits.
A live `/api/check` query costs 5–6 credits. The plan allows 15k
credits/month and 50 requests/min. API friction is logged in `FRICTION.md`.

Works (credits): key/info (0), rwa map (0), rwa info (1), rwa quotes/latest (1),
rwa assets/list (1), rwa issuers/list (1), rwa issuers (1), /v2/cryptocurrency/info (1),
/v1/dex/token/pools (1), /v3/fear-and-greed/latest (1), all 3 /v5/derivatives/liquidations/* (1).
**Blocked:** `/v5/real-world-assets/market-pairs/list` returns 403 (error_code 1006).

Fields that exist:
- **map** `data.rwa_assets[]`: rwa_id, name, symbol, slug, asset_type, rwa_rank, has_tokens.
  GOLD=1, NVDA=2.
- **quotes/latest** `data.rwa_assets[]`: rwa_id, symbol, asset_type, average_tokenized_price,
  tokenized_market_cap, tokenized_volume_24h, last_updated, quotes[] (USD).
  - `tokens[]`: crypto_id, symbol, name, issuer_id, issuer_name, price, market_cap, volume_24h.
    No chain and no contract address.
  - `tradfi_markets[]`: exchange{exchange_id,name,slug}, ticker, market_url. Empty for GOLD.
- **assets/list**: same totals as quotes but without tokens/tradfi_markets. Not needed.
- **info** `data.rwa_assets[]`: name, website, employees, founded, industry, cik, about{description (markdown), logo, website, date_added}, primary_exchange (undocumented).
  Equity fields are null for commodities; logo is null for both assets.
- **issuers/list** `data.issuers[]`: name, website, logo, issuer_id, num_tokens (25 issuers).
  **issuers**: same fields plus tokens[]{name,symbol,crypto_id,rwa_id}.
- **/v2/cryptocurrency/info** `data[<crypto_id>]`: `contract_address[]{contract_address, platform{name, coin{slug}}}`
  plus a primary `platform{slug, token_address}`. This is how a wrapper gets its contracts.
- **dex/token/pools** (`platform`, `address`, `size`): returns `{data:[...], status}`, not the
  bare array the docs show. Row fields: addr, exn, exid, liqUsd, v24, t0/t1{addr,sym,n,lg}, bidx, top, pubAt.
- **fear-and-greed/latest** `data`: value, value_classification, update_time.
- **liquidations** `data.quotes[]` / `data.exchanges[].quotes[]` / `data.cryptocurrencies[].quotes[]`:
  total/long/short liquidations over 1h/4h/24h. Market-wide crypto only, nothing RWA-specific.

The 5 surprises (the engine and UI must handle them):
1. **Units differ.** CGO and VNXAU are priced per gram (about 137.9) while other gold wrappers
   are per troy ounce (about 4,285); 1 oz = 31.1035 g. Normalise units before any premium math.
2. **Token symbols collide.** Two different wrappers are both `NVDA` (Robinhood 40685 and
   "NA (Derivatives)" 38153). Key everything by `crypto_id`, never by symbol.
3. **Some wrappers aren't real tokens.** Issuer "NA (Derivatives)" rows have market_cap 0.
   Dinari NVDA.D has null price, market_cap and volume. Filter them out or flag them; don't
   score them.
4. **Chain names differ between endpoints.** The contract lookup says `bnb` but DEX pools
   needs `bsc`. The wrong name returns a misleading 500 "system is busy". The mapping is in
   `DEX_PLATFORM_ALIASES` in lib/cmc.ts. Only `SUPPORTED_DEX_CHAINS` (ethereum, solana, bsc)
   are verified. Other chains (Arbitrum, XDC, Hyperliquid, Robinhood, OKB, TON…) are skipped
   and reported as a `pools_not_checked` gap.
5. **The exit check is patchy.** Market pairs are blocked. DEX `liqUsd`/`v24` are long decimal
   strings (parse them), and `liqUsd` is absent on about half of NVDA pool rows. Build exits
   from token volume_24h + pool depth where present + tradfi_markets, and put the gaps in the
   "can't tell you" panel.

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
