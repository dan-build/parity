# API friction log

Where the CoinMarketCap API got in the way while building PARITY, found by probing every
endpoint we need with GOLD (`rwa_id` 1) and NVDA (`rwa_id` 2) on the hackathon Startup-tier key.

- Probe date: 25 Sep 2026
- Script: `scripts/probe.ts` (`npm run probe`)
- Raw responses: `fixtures/`
- Per-call log: `fixtures/_probe-summary.json`
- Evidence files named below for items 1–7 are from the first probe (commit `8d976c7`).
  Fixtures have since been re-recorded; `fixtures/_index.json` maps each request to its file.

| # | Issue | Impact on PARITY |
|---|---|---|
| 1 | RWA market pairs is blocked on Startup tier | No per-venue exit data |
| 2 | RWA `tokens[]` has no chain or contract address | Extra call and lookup for every wrapper |
| 3 | Wrong DEX platform name returns a misleading 500 | Looked like an outage, not a bad parameter |
| 4 | DEX pools response shape differs from the docs | Parser written from the docs would break |
| 5 | DEX numbers are long decimal strings | Every value must be parsed |
| 6 | `liqUsd` missing on many pool rows | Pool depth is incomplete for tokenised stocks |
| 7 | `primary_exchange` is returned but not documented | Can't rely on it being stable |
| 8 | RWA map is paginated and caps `limit` at ~200 | Resolving a name costs 20+ requests |
| 9 | One invalid id fails the whole `/v2/cryptocurrency/info` call | SILVER lost every contract until we added `skip_invalid` |
| 10 | `error_code` is a string on some endpoints, a number on others | Error handling must normalise it |
| 11 | RWA tokens can have a `null` symbol and name | UI must never print "null" |
| 12 | No unit field on RWA tokens | Per-gram gold looks 97% cheaper until we infer the unit |
| 13 | Tokens of one asset can be priced ~10× apart, with no ratio field | KLAC can't be compared at all |

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

## 8. The RWA map is paginated and caps `limit` at about 200

- **What happened:** `/v5/real-world-assets/map` returns 100 rows by default. `limit=200` works;
  `limit=500` and `limit=1000` return `4001 "Invalid parameter"`. The full map is about 4,000
  assets, so 20+ pages.
- **Impact:** Resolving a name like "nvidia" needs the whole map. Fetched naively on every
  query it exhausted the 50 requests/min limit in one probe run (429s). We now try the
  one-request `map?symbol=` lookup first and cache the full map for an hour.
- **Suggestion:** document the max `limit`, or add a name/slug search parameter.

## 9. One invalid id fails the whole `/v2/cryptocurrency/info` call

- **What happened:** SILVER's quotes list crypto_id 39318, which `/v2/cryptocurrency/info`
  rejects: HTTP 400 `"Invalid value for 'id': '39318'"`, and no data for the other 4 ids.
  `skip_invalid=true` returns the 4 valid ones.
- **Impact:** An id that one CMC endpoint hands out breaks a different CMC endpoint.
- **Suggestion:** don't list ids in RWA `tokens[]` that the rest of the API rejects, or make
  `skip_invalid` the default.

## 10. `error_code` type varies

- **What happened:** most errors send `"error_code": "1006"` (string); the 400 above sent
  `"error_code": 400` (number).
- **Suggestion:** one type everywhere.

## 11. RWA tokens can have a null symbol and name

- **What happened:** one SILVER wrapper (crypto_id 39318, "NA (Derivatives)") has
  `symbol: null, name: null, price: null`.
- **Impact:** any UI keyed or labelled by symbol breaks. `/v2/cryptocurrency/info` has no entry
  for this id either, so there's nothing to fall back on. We show the symbol, else the name,
  else "Unnamed listing", and never a raw id.

## 12. No unit field on RWA tokens

- **What happened:** CGO and VNXAU are quoted per gram (about $137), the other gold tokens per
  troy ounce (about $4,285). Nothing in `tokens[]` says which unit a price is in.
- **Impact:** compared naively, the per-gram tokens look 97% cheaper. We infer the unit from
  the consensus price (a token within ±5% of the others once ×31.1035 is per gram) and convert
  before any premium maths. The UI shows the conversion so it isn't a silent fix.
- **Suggestion:** add a `unit` (and, for stocks, a share ratio) to each token.

## 13. Tokens of one asset can be priced ~10× apart, with no ratio field

- **What happened:** for KLAC (probed 26 Sep 2026), KLACon (Ondo) is $1,883.88 and KLACx
  (Backed) is $188.26, both listed as KLAC tokens. That's likely a share ratio (one token =
  a tenth of a share), but nothing in the response says so.
- **Evidence:** `fixtures/v5_real-world-assets_quotes_latest_rwa_id=58.json`
- **Impact:** neither price can be trusted as "the" KLAC price, so PARITY calls every KLAC
  token a ghost ("the tokens don't agree on a price") rather than guess a ratio.
- **Suggestion:** same as 12: a `unit` / `shares_per_token` field would make this comparable.
