# The Parity registry

What each tokenised-asset token **actually represents**: the facts CoinMarketCap and most
APIs don't carry. One file per asset (`GOLD.json`, `NVDA.json`…), editable by pull request.

Parity reads units from here first (see [`METHOD.md`](../METHOD.md) §4), so a correct entry
makes every verdict for that token more accurate, for everyone who uses Parity or this data.

## What a token entry records

| Field | Meaning |
|---|---|
| `crypto_id` | CoinMarketCap's id for the token (the key; symbols collide) |
| `unit` | What one token is a claim on: `{ "measure": "troy_ounce" \| "gram" \| "share", "per_token": 1 }`. `per_token: 0.1` = a tenth of a share |
| `unit_note` | Required when `unit` is `null`: why it isn't known yet |
| `contracts` | Chain and address |
| `redemption` | How a holder redeems for the real asset: `{ summary, url, source }` |
| `eligibility` | Who can hold it (KYC, jurisdictions): `{ summary, url, source }` |
| `attestations` | Proof-of-reserve or audit reports: `[{ url, source }]` |
| `verified_by_issuer` | `true` only when the issuer confirmed the entry (see below) |

Every fact carries a `source`:
- `issuer`: from the issuer's own documents
- `community`: added by a contributor, with a link
- `inferred-from-price`: Parity worked it out from prices
- `cmc`: from CoinMarketCap

**Unknown stays `null`. Never guess.** A wrong unit misleads buyers; an empty one is shown as
a gap.

## How to contribute
1. Edit the asset's file and fill in what you can **with a link to the source** (the issuer's
   site, terms, attestation PDF).
2. Run `npm test`. The registry tests check the schema, check that the token belongs to that
   asset in CoinMarketCap's data, and check that a recorded unit puts the token's price within
   5% of the reference (spot for metals). A wrong ratio fails here.
3. Open a pull request. Say where each new fact comes from.

**Issuers:** open a pull request from an address or account we can tie to you (e.g. a link
from your official site or docs to the PR), and we'll mark your entries `verified_by_issuer`.

## Wanted
- **KLAC:** KLACon (Ondo) is ~$1,884 and KLACx (Backed) ~$188. One is probably a fraction or
  multiple of a share. Which, according to the issuers?
- **KAG (Kinesis silver):** priced ~48% below silver spot in CoinMarketCap's data. Is the price
  stale, or is the unit different?
- Redemption terms, eligibility and attestations for every token: all empty today.

New assets: `npm run registry:seed` adds entries for the watched assets in
`scripts/watchlist.json` from saved data (it never overwrites existing entries).
