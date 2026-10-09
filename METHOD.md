# How Parity decides

**Method version 1.2.1**

This is the whole method: every rule and threshold behind a verdict, in order. It's
versioned. When a rule changes, the version goes up and the changelog below says why. Every
result carries the version that produced it (`method_version` in `/api/check` and in the MCP
tool's output).

The code is in `lib/verdict.ts` (the engine) and `lib/present.ts` (the wording). A test
(`lib/method.test.ts`) fails if this document and the code disagree on a number.

---

## 1. Find the asset, not the symbol
A query resolves to CoinMarketCap's `rwa_id` (ticker first, then name). Everything after
that is keyed by `rwa_id` and each token's `crypto_id`, never by symbol: different tokens
share symbols (two are called "NVDA").

## 2. Collect every token
`/v5/real-world-assets/quotes/latest` lists every token that claims to be the asset, with
issuer, price, market cap and 24h volume.

## 3. Set aside what can't be held (Ghost, before any maths)
A token is a **Ghost** straight away if:
- its issuer is a derivatives listing (e.g. "NA (Derivatives)"): a price feed, not a token, or
- it has no live price (missing, zero or not a number).

## 4. Put every price in the same unit
**First, the open registry** (`registry/<SYMBOL>.json`). Where it records what one token
represents (an ounce, a gram, a share, or a fraction of one), that unit is used, and the
token's price is converted to per ounce or per share. Each recorded unit says where it came
from (the issuer, a contributor, or inferred from price). A test checks that every recorded
unit puts the token's price within 5% of the reference, so a wrong entry fails CI.

**Otherwise, inference from price.** For commodities, some tokens are quoted per gram and
others per troy ounce, and the API doesn't say which. Parity finds the **consensus price**: the level that the most tokens sit
within **±5%** of, either as quoted or multiplied by **31.1035** (grams per troy ounce). A
token that only agrees with the consensus after that multiplication is per gram, and is
converted. The page shows each conversion.

## 5. The reference price
Premiums are measured against one reference price:

- **Metals (gold, silver, platinum, palladium): CoinMarketCap's spot price** for one troy
  ounce, taken **at the moment of the token quotes** (`/v2/tools/price-conversion` with
  `time` set to the quotes' `last_updated`). The comparison is like-for-like, live or replayed.
- **Stocks and ETFs: the typical price,** the median of the remaining tokens' prices after unit
  conversion. CoinMarketCap has no share prices, so this compares tokens with each other. If no
  token is left to compare, no typical price is shown.

If the spot price can't be fetched, metals fall back to the typical price, and the page says so.
The typical price is always computed too (unit detection in §4 uses it).

**Stocks outside market hours:** tokens trade around the clock, but the shares don't. When the
quotes were taken outside regular US hours (Mon–Fri 9:30–16:00 New York time), the page says
prices can drift from the last close. Market holidays aren't known yet.

## 6. Premium
Each token's **premium** = its price ÷ the reference price − 1, shown in % and in $ per unit.

## 7. Prices that don't track the asset (Ghost)
A token more than **5%** above or below the reference price doesn't track the asset. It's a
**Ghost** ("a price far from the rest"). It may still be holdable; it just can't be trusted
as this asset's price.

## 8. Can you sell it later? (exit score, 0–100)

| Part | Tiers |
|---|---|
| 24h volume | ≥ $1,000,000 → 40 · ≥ $100,000 → 25 · ≥ $10,000 → 10 |
| DEX pool depth (Ethereum, Solana, BSC) | ≥ $1,000,000 → 40 · ≥ $250,000 → 25 · ≥ $50,000 → 10 |
| Listed on a traditional exchange | 20 |

Pools on other chains aren't checked yet, and that's shown as a gap. The market-pairs
endpoint (where a token trades) isn't available on our API plan, and that's shown too.

## 9. Each token's verdict
- Exit score below **40** → **Thin**.
- Otherwise, premium above **+1%** → **Rich**.
- Otherwise → **Fair**. A discount beyond **−1%** stays Fair, but is flagged ("a discount
  this big usually has a reason").

## 10. The page's verdict
The best token decides it: Fair beats Rich beats Thin. Among equals, the higher exit score
wins, then the larger market cap. If every token is a Ghost, the page is **Ghost**.

## 11. The answer, and when to recommend nothing
- The best token is named as the **best way in**, but only if it traded in the last 24 hours.
- If it didn't, Parity recommends nothing: **"no easy way out"**.
- If every token is a Ghost: **"no price to trust"** when tokens disagree on price, otherwise
  **"nothing to hold"**.
- Parity never says "buy".

## 12. What this method can't see
- The real share price of stocks: CoinMarketCap doesn't have it, so stock tokens are compared
  with each other. If they all drifted together, it wouldn't show. (Metals use real spot.)
- Which exchanges each token trades on (market pairs not in our plan).
- Pool depth on chains other than Ethereum, Solana and BSC.
- Whether the issuer really holds the asset: no API can check that. Read the issuer's
  attestations.

---

## Changelog

### 1.2.1 (7 Oct 2026)
**Wording only; no rule changed.** From an evaluation in which an AI assistant answered buyer
questions using Parity's MCP tool:
- A derivative price feed is counted once, as "not a token", and no longer also as "doesn't
  track" (KLAC said "3 don't track KLAC"; two holdable tokens disagree, plus one feed). Feeds
  and tokens with no price are named apart ("3 listings can't be held. One is a price feed…").
- A single per-gram token is named ("GRAMS is priced per gram") instead of "1 is".
- "Fair: whichever token you pick" says "whichever of the N real tokens" when the list also has
  listings that aren't tokens (NVDA).
- Stocks with only 1–2 live tokens get a gap saying a premium there means "more than the other
  token", not "more than the share" (UNH).
Golden set: verdicts unchanged; NVDA's sub-line is the one baseline change.

### 1.2.0 (1 Oct 2026)
**Units come from the open registry first.** Parity now keeps a public registry of what each
token represents (`registry/`), and the engine uses its units before inferring them from
price. It can also convert share ratios (e.g. a token for 0.1 of a share), which inference
can't. The registry was seeded from the units inference already found, so on the golden set
nothing changed (`npm run eval`: no differences). 35 of 47 tokens have a unit; the other 12
(including both KLAC tokens) stay unknown, with a note saying why, until someone adds a source.

### 1.1.0 (1 Oct 2026)
**Metals are measured against real spot.** Gold, silver, platinum and palladium tokens are now
compared with CoinMarketCap's spot price at the moment of the quotes, instead of with each
other. This answers "is it worth what it claims?", not just "do the tokens agree?".
Effect on the golden set (`npm run eval`): no verdict changed. Gold's reference moved from the
token median $4,281.38 to spot $4,285.41; five of its six live tokens sit within ±0.2% of spot
(CGO, quoted per gram, is −0.93%; corrected 9 Oct, this entry first said "its tokens"). Silver's
moved from $64.42 to spot $64.29 (XAGX +0.19%, GRAMS +0.26%; KAG −48.5%, still off-track).
Stocks are unchanged: CoinMarketCap has no share prices. Stocks now also say when quotes were
taken outside US market hours (wording only, not a rule change).

### 1.0.0 (1 Oct 2026)
First published version. It's the method as submitted to Build with CMC (30 Sep 2026); no
rule changed, it was written down. The golden set (`evals/golden.json`) and baseline
(`evals/baseline.json`) record its output on saved data.
