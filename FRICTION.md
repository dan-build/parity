# API friction log

Where the CoinMarketCap API got in the way while building PARITY, found by probing every
endpoint we need with GOLD (`rwa_id` 1) and NVDA (`rwa_id` 2) on the hackathon Startup-tier key.

- Probe date: 25 Sep 2026
- Script: `scripts/probe.ts` (`npm run probe`)
- Raw responses: `fixtures/`
- Per-call log: `fixtures/_probe-summary.json`

| # | Issue | Impact on PARITY |
|---|---|---|
| 1 | RWA market pairs is blocked on Startup tier | No per-venue exit data |
| 2 | RWA `tokens[]` has no chain or contract address | Extra call and lookup for every wrapper |
| 3 | Wrong DEX platform name returns a misleading 500 | Looked like an outage, not a bad parameter |
| 4 | DEX pools response shape differs from the docs | Parser written from the docs would break |
| 5 | DEX numbers are long decimal strings | Every value must be parsed |
| 6 | `liqUsd` missing on many pool rows | Pool depth is incomplete for tokenised stocks |
| 7 | `primary_exchange` is returned but not documented | Can't rely on it being stable |

---

## 1. `/v5/real-world-assets/market-pairs/list` returns 403 on Startup tier

- **What happened:** HTTP 403, `error_code: "1006"`, "Your API Key subscription plan doesn't
  support this endpoint." This happened for both GOLD and NVDA.
- **Evidence:** `fixtures/rwa-market-pairs.GOLD.json`, `fixtures/rwa-market-pairs.NVDA.json`
- **Impact:** This is the endpoint that says where a tokenised asset trades and how much.
  Without it, PARITY's "can I sell it later?" check has to be rebuilt from other data:
  - each wrapper's `volume_24h`
  - DEX pool depth
  - the `tradfi_markets[]` list
- **Suggestion:** open this endpoint (even rate-limited) to the tier the RWA track is built
  on, or say in the RWA docs which tier each endpoint needs.

## 2. RWA `tokens[]` has no chain or contract address

- **What happened:** `/v5/real-world-assets/quotes/latest` lists every wrapper token with these
  fields: `crypto_id`, `symbol`, `name`, `issuer_id`, `issuer_name`, `price`, `market_cap`,
  `volume_24h`. None of them says which chain the token is on or gives its contract address.
  The issuer endpoints don't either.
- **Evidence:** `fixtures/rwa-quotes-latest.GOLD_NVDA.json`
- **Impact:** Any on-chain check (DEX pools, liquidity) needs an extra `/v2/cryptocurrency/info`
  call to turn each `crypto_id` into contract addresses. That costs more credits and adds
  latency and another point of failure. Wrappers deployed on many chains then need a policy
  for which contract to check.
- **Suggestion:** add `platform` and `contract_address` (or the full list of contracts) to each
  entry in `tokens[]`.

## 3. Wrong DEX platform name returns a misleading 500

- **What happened:** `/v2/cryptocurrency/info` names BNB Chain with the coin slug `bnb`. Passing
  `platform=bnb` to `/v1/dex/token/pools` returns HTTP 500, "The system is busy, please try
  again later!". This happened every time, including with the alternative
  `network_slug`/`contract_address` parameters. `platform=bsc` works.
- **Evidence:** the first probe run returned 500 for NVDAB with `platform=bnb`. It worked after
  the script mapped `bnb` to `bsc` (`fixtures/dex-token-pools.NVDA.NVDAB.bsc.json`).
- **Impact:** A bad parameter looks like a server outage. The obvious reaction is to retry,
  which never succeeds. Other chains may have the same slug mismatch; TON (slug `gram`) and
  Sui are untested.
- **Suggestion:**
  - Return 400 with "unknown platform" for bad platform values.
  - Accept the same chain identifiers across the DEX and cryptocurrency endpoints, or publish
    the mapping between them.

## 4. `/v1/dex/token/pools` response shape differs from the docs

- **What happened:**
  - **Response wrapper:** the reference says the 200 response is a bare array of
    `TokenTopPoolDTO`. The real response is wrapped in `{ "data": [...], "status": {...} }`.
  - **Parameter names:** the docs disagree with each other. The reference page and the
    keyless-API example use `platform` and `address`. The DEX guide's workflow uses
    `network_slug` and `contract_address`.
- **Evidence:** every `fixtures/dex-token-pools.*.json` file
- **Impact:** A parser written from the reference page fails on the first real response.
- **Suggestion:** fix the response schema in the reference, and use one set of parameter
  names everywhere.

## 5. DEX numbers are returned as long decimal strings

- **What happened:** pool values such as `liqUsd` and `v24` come back as strings with about 18
  decimal places, for example `"16329735.502696241094590555"`. The RWA endpoints return
  ordinary JSON numbers.
- **Evidence:** `fixtures/dex-token-pools.GOLD.PAXG.ethereum.json`
- **Impact:** Every value must be parsed, and the two families of endpoints need separate
  handling. This is manageable but easy to get wrong when sorting or comparing, because
  strings sort alphabetically.
- **Suggestion:** document that these fields are strings and why (precision), or return
  numbers to match the other endpoints.

## 6. `liqUsd` is missing on many pool rows

- **What happened:** `liqUsd` is listed in the schema but left out entirely (not even `null`)
  on 5 of the 10 pool rows returned for each of NVDAX (Solana), NVDAon (Ethereum) and NVDAB
  (BSC). Some of those rows show real 24h volume, for example NVDAon/USDon at about $44k.
  Every GOLD pool had it.
- **Evidence:** `fixtures/dex-token-pools.NVDA.*.json`
- **Impact:** For tokenised stocks, pool depth (the key number for "can I sell it later?") is
  missing for half the pools. PARITY has to show that gap to the user instead of a number.
- **Suggestion:** return `liqUsd: null` with a reason, or document when liquidity can't be
  computed.

## 7. `primary_exchange` is returned but not documented

- **What happened:** `/v5/real-world-assets/info` returns `primary_exchange` (`"Nasdaq"` for
  NVDA, `null` for GOLD). The field isn't in the documented response schema.
- **Evidence:** `fixtures/rwa-info.GOLD_NVDA.json`
- **Impact:** It's useful, but we can't tell whether it's stable enough to show to users.
- **Suggestion:** add it to the schema.
