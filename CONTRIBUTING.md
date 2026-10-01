# Contributing to Parity

Thanks for helping. Parity answers one question for a regular buyer of a tokenised asset:
*is this token actually the thing, at a fair price, and can I sell it later?* The answer has
to be **honest and checkable**, so a few rules matter more than any feature.

## The rules
1. **Never say "buy".** Parity is informational. Say "best way in", or that there isn't one.
2. **Every claim needs data behind it.** If the copy says it, a test should prove the data
   backs it (see `lib/present.test.ts`).
3. **Show gaps; don't guess around them.** If the data can't tell, say so in the UI.
4. **Key by ID, never by symbol.** Different tokens share symbols.
5. **Method changes are versioned.** If a rule or threshold changes, bump `METHOD_VERSION`
   in `lib/verdict.ts`, add a changelog entry to `METHOD.md` saying why, then refresh the
   baseline with `npm run eval -- --update`. CI fails otherwise.

## Getting started
```bash
npm install
npm run dev     # http://localhost:3000, saved data, no API key needed
npm test        # unit tests, the golden set, the MCP server
npm run eval    # the verdict scorecard and baseline diff
```
You don't need a CoinMarketCap key to work on Parity: tests and the eval run on the real
responses saved in `fixtures/`.

## Common changes
- **Report a wrong verdict:** open a "This verdict looks wrong" issue with what Parity said,
  what you expected and your source. Confirmed mistakes go in the corrections log and get a
  golden case so they can't come back.
- **Add a golden case:** add an entry to `evals/golden.json`, with a `why` saying what it
  proves. If the asset isn't saved yet, someone with a key records it:
  `npm run probe -- SYMBOL` (about 5–7 credits).
- **Change the method:** follow rule 5. The pull request should include the eval's diff
  report: which verdicts changed, and why that's right.

## Before you open a pull request
- `npm test` and `npm run eval` pass
- `npx eslint app components lib scripts` and `npx tsc --noEmit` are clean
- New copy is plain English a first-time buyer would understand
- No API keys or `.env*` files in the diff

See [`ROADMAP.md`](ROADMAP.md) for where the project is going, and
[`METHOD.md`](METHOD.md) for how verdicts are decided.
