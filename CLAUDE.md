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

## Status after the deadline (read first)
The entry is submitted. **Until results are announced, `main` (= tag `buildwithcmc-submission`,
`ae06a52`) and Vercel production are frozen; all work goes on `next` (draft PR #1).** Start a
session with `design/HANDOFF.md` (current state, rules, git conventions, how to verify) and
`design/AFTER-RESULTS.md` (the post-results checklist); both are local and git-ignored.

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
10. STRETCH: tiny MCP server exposing `check_rwa(query)` using the same engine. **Done:**
    `lib/mcp.ts` (server + `checkRwa()`), `scripts/mcp.ts` (stdio; relative imports on purpose,
    because tsx resolves `@/` from the cwd), evaluated by `lib/mcp.test.ts`

Out of scope: x402, user accounts, databases, portfolio tracking, charts for decoration.
(Exception on the roadmap: private storage for history snapshots, e.g. Vercel Blob/KV. Never public.)

## Stack
- Next.js (App Router) + TypeScript + Tailwind, deployed on Vercel
- All CMC calls happen server-side in route handlers. The key lives in `.env.local`
  as `CMC_API_KEY` and is NEVER sent to the browser or committed.
- `lib/cmc.ts`: typed client, one function per endpoint, in-memory cache 60s,
  logs every call into an evidence array returned with the response
- `lib/verdict.ts`: pure scoring logic, no fetching, covered by tests
- `fixtures/`: real captured responses used by fixture mode and tests
- Data mode: `PARITY_DATA_MODE=fixture` (default, zero credits, replays `fixtures/`) or `live`
  (uses `CMC_API_KEY`). See `lib/data-source.ts`. Fixtures cover GOLD, NVDA, SPY, TSLA, AAPL, SILVER, UNH, KLAC, MS.
- UI: `lib/present.ts` turns a result into copy and numbers (incl. `recommended()`: no route
  when the best-ranked token has zero 24h volume); `lib/log.ts` builds the narrating log from
  real evidence (one line per call); `components/reveal/Reveal.tsx` is the single clock; all
  motion timings live in `lib/reveal/timings.ts`; instrument geometry in `lib/reveal/layout.ts`;
  `components/reveal/Instrument.tsx` is the behaviour-only instrument (styles and coin passed in).
  The page is `components/desk/`: `Desk.tsx` (shell, states, URL), `Header`, `Hero`
  (Verdict / Tiles / Reasons), `Log`, `Stage`, `List`, `Lower`, `Evidence`, `States`, `RingCoin`.
  `?t=1560` freezes the reveal, `?drawer` opens Evidence.
- Fallback: in live mode with no key, or when CMC rate-limits (429 / codes 1008–1011) or fails,
  `runCheck` answers from `fixtures/` when that asset is saved (`fallback` on the response; the
  page shows a one-line notice). Rate-limited and not saved → "try again in a minute".
- Share image: `app/api/og/route.tsx` (`/api/og?q=`), set as each page's OG/Twitter image by
  `generateMetadata` in `app/page.tsx`; `metadataBase` comes from `SITE_URL` or Vercel's URLs.
- Scripts: `npm run probe` (record the six default assets + extras), `npm run probe -- UNH MS`
  (record just those, engine calls only), `npm run scan -- --budget 60` (screen assets for
  RICH/GHOST with live quotes, saves nothing). Demo fixtures cover all four verdicts:
  FAIR (GOLD, NVDA, SPY, TSLA, AAPL), THIN (SILVER), RICH (UNH), GHOST (KLAC, MS).

## CMC API notes (verify each with the probe script before relying on it)
- Base URL: https://pro-api.coinmarketcap.com, header `X-CMC_PRO_API_KEY`
- RWA endpoints live under /v5/real-world-assets/* (map, info, quotes/latest, issuers...)
- /v1/key/info tells us the plan and credits left
- /v1/dex/token/pools may give on-chain depth for wrapper tokens
- Some endpoints may 403 on the hackathon Startup tier → degrade gracefully and
  show it in the "can't tell you" panel, never crash

## Probe findings (25 Sep 2026, Startup key; don't re-probe, read `fixtures/`)
`npm run probe` (scripts/probe.ts) runs the engine's real `check()` for the six default assets
(GOLD, NVDA, SPY, TSLA, AAPL, SILVER) through
a recording transport. It saves every response to `fixtures/` and adds it to `fixtures/_index.json`
(request key → file), which `fixtureTransport` in lib/cmc-fixtures.ts replays for tests. It also
writes a per-call log to `fixtures/_probe-summary.json`. One run costs about 35 credits;
`npm run probe -- UNH MS KLAC` records just those (≈10 credits for the three).
A live `/api/check` query costs 5–8 credits (GOLD 8, with the spot and Fear & Greed calls). The plan allowed 15k
credits/month and 50 requests/min at probe time; on 1 Oct 2026 the same key reported
450k/month and 600/min. Don't assume either: read `/v1/key/info` (scripts/snapshot.ts does). API friction is logged in `FRICTION.md`.

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
1. **Units differ.** CGO and VNXAU are priced per gram (about $136.5 and $137.5) while other gold wrappers
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

## Design principles (Direction B · Desk)
- One window, one answer. A dark trading-tool window (titlebar, `verdict │ log`, then the
  instrument, the full list, the lower cards). The verdict word is the hero.
- Dark and precise, not loud. Tokens in `app/globals.css`: page `#0F0F10`, panel `#161618`,
  hairlines at 8% white. Gold `#E3B04B` is the brand accent (brand mark, eyebrows, focus, the
  per-gram story). Each verdict gets one colour via `[data-verdict]` → `var(--v)`: FAIR green,
  RICH red, THIN amber, GHOST grey. Colour only carries meaning: a fair premium is plain text.
- Type: Geist for words, Geist Mono for data, labels and the log. Tabular figures everywhere.
  Premiums as $ and %, never bps by default. Small mono labels are uppercase with tracking.
- The log tells the truth about the work: every line is a real call or finding, the call count
  matches the evidence, and it folds into a toast that carries the answer and opens Evidence.
- Motion is one clock and one story: coins drop, the log narrates, the verdict settles, rows
  stagger once. Skeletons match the final layout; no long spinners.
- Phones first: the instrument sits straight under the verdict so the reveal is on screen;
  the log is a one-line strip, then the toast. No horizontal scroll, no truncated names:
  ring-coin tickers shrink (8px floor) and show the full name on hover or tap; issuer and chain
  wrap rather than clip.
- Never say "Buy". Use "best way in". When nothing trades, recommend nothing ("no easy way out").
- Plain-English copy. No jargon a first-time buyer wouldn't know.

## Share image (`/api/og?q=`)
Uses **Direction C's colour field**, not the desk: a grain field in the verdict's colour behind
a white card (ticker + token count, the verdict word in C's verdict colour, the answer chip, the
sub-line, three facts). Satori can't do C's mask, blend mode or `feTurbulence` grain, so the
fields are pre-rendered per verdict to `app/api/og/bg/*.jpg` by `scripts/og-backgrounds.mjs`
(C's gradient stops live there now; the labs are gone). Fonts are Geist TTFs in
`app/api/og/fonts/`. Any failure renders the plain branded card, never an error. Keep it legible
at X's thumbnail size: the verdict word and chip must read at ~500px wide.

## Working rules for Claude
- Before any multi-file change, propose a short plan and wait for approval.
- Verify before every push: `npx eslint app components lib scripts`, `npx next typegen && npx tsc --noEmit`,
  `npm test`, `npm run eval`, `npm run build`. Commit style and the co-author line: see `design/HANDOFF.md`.
- Ask before anything public or irreversible (GitHub comments, PR/issue actions, posts, merges,
  tag moves) and show the exact text first.
- Keep changes small; after each step, tell me exactly how to check it works.
- Never invent API fields. If unsure, read `fixtures/` or run the probe script.
- Not financial advice: show a one-line disclaimer on the card.
- Never redistribute CoinMarketCap data: no public data API or hosted data endpoint, no published
  history (CMC's terms allow use inside our own product only). Self-hosted MCP with the user's
  own key is fine.
