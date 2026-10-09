# Roadmap

Parity started as a hackathon entry (Build with CMC, Sep 2026). This is the plan to make it a
product people in crypto rely on: the **neutral, open trust check for tokenised assets**.

**What must never change:** honesty with receipts. Every verdict traces back to real
responses. Parity says what the data can't tell you, refuses to guess (KLAC, SILVER), and
never says "buy".

**How we work:** every phase ships with its **evaluations**. A feature isn't done when it
works; it's done when there's an automated check that would catch it breaking, and a measure
that says whether it helped.

---

## Evaluation principles (apply to every phase)

1. **Golden set.** A fixed list of saved assets, each with its expected verdict and key claims
   (e.g. `GOLD → FAIR, best way in XAUt, 2 per-gram tokens`). It runs in CI. Any change to the
   method must produce a **diff report**: which verdicts changed, and why.
2. **Claims are tested, not just code.** Every sentence the UI or the MCP tool can say has a
   test that the data backs it ("whichever token you pick" only when every holdable token is
   fair). No "buy", anywhere, is tested too.
3. **Live drift checks.** Scheduled runs compare live results against the golden set's
   *shape* (not its numbers) and flag new API surprises: new units, new null fields, new
   error codes. New surprises go into FRICTION.md.
4. **Measured outcomes.** Each phase names the metric that says it worked. If we can't measure
   it, we don't claim it.

---

## Phase 0: submission freeze (now → hackathon results)

- [x] MCP server `check_rwa(query)` (`lib/mcp.ts`, `npm run mcp`)
- [x] **Eval:** in-memory client + real stdio script, all four verdicts, schema-validated (`lib/mcp.test.ts`)
- [x] Tag the submitted state: `buildwithcmc-submission`
- [x] Keep `main` and production unchanged until results. New work goes on `next`, which
      Vercel deploys to its own preview URL
- [ ] Watch CoinMarketCap credit use daily; the site falls back to saved data if it runs out

## Phase 1: foundations (first 2–4 weeks after results)

**Goal:** make the verdict method explicit, testable and reproducible before adding reach.

- [x] **Golden set + eval runner** (`npm run eval`): expected verdicts and claims for every
      saved asset, producing a scorecard and a diff against the last run
- [x] **Published method** (`METHOD.md`): every threshold (rich > +1%, off-track > 5%, thin
      exit < 40…), with a version number and a changelog
- [x] **Snapshots** (`npm run snapshot`): history as JSON lines in a private, git-ignored
      `history/` folder (CoinMarketCap's terms allow storing data for your own product, not
      publishing it; an earlier public `data` branch plan was dropped on 7 Oct). The cadence
      adapts to the CoinMarketCap plan: a full check per run on a big plan (≥100k
      credits/month), or prices plus one full check a day on 15k. A 4,000-credit reserve is
      always kept for the live site
- [x] **History** per token: premium, volume, exit score and liquidity over time (`lib/history.ts`)
- [ ] Scheduled snapshots into private server-side storage (e.g. Vercel Blob or KV, not the
      public repo), so history builds without a laptop running
- [ ] Pages read snapshots instead of calling the API per visitor (once history is flowing)
- [x] **Open-source hygiene:** LICENSE (MIT), CONTRIBUTING.md, issue and PR templates
- [x] **CI** (GitHub Actions): lint, types, tests, eval and build on every push and PR
- [x] Starter issues labelled "good first issue" (#2 market holidays, #3 coin tooltips, #4 a new golden case)

**Evals:** the golden set passes in CI; a method change without a version bump fails CI;
snapshot rows are tested on saved data (units converted, typical price matches the full
check, no NaN).
**Measure:** API credits per 1,000 page views (should fall sharply); time from push to deploy.

## Phase 2: the real price (1–2 months)

**Goal:** answer "is this token worth what it claims?", not only "do the tokens agree?".
**Constraint for now:** CoinMarketCap only. A second, free provider for share prices is a
decision for after the hackathon results.

- [x] **Metals: real spot from CoinMarketCap** (method 1.1.0). Gold, silver, platinum and
      palladium tokens are measured against CMC's spot price at the moment of the quotes
      (`/v2/tools/price-conversion` with `time`). On the golden set no verdict changed; gold
      tokens sit within ±0.2% of spot except CGO (−0.93%)
- [x] **Stocks: market-hours awareness.** When quotes were taken outside US hours, the page says
      tokens can drift from the last close
- [x] "What the data can't tell you" drops "the real price" for metals
- [ ] **Stocks: a real share price.** CoinMarketCap doesn't have one; needs a second provider
      (after results)
- [ ] US market holidays (today only weekends and hours are known)

**Evals:** tracking error of each token against its reference price over the history
(flags tokens that drift); a backtest over saved history checks verdicts wouldn't flip-flop
hour to hour (verdict stability rate); weekend and after-hours cases in the golden set.
**Measure:** share of verdicts where the reference price changes the answer.

## Phase 3: the open registry (1–3 months, alongside Phase 2)

**Goal:** the dataset everyone else needs, and the thing Parity becomes known for.

- [x] **`registry/`:** one JSON file per watched asset (9), recording each token's unit and
      share ratio, contracts, issuer, and empty slots for redemption terms, eligibility and
      attestations. Seeded from saved data: 35 of 47 tokens have a unit; 12 are marked unknown
      with the reason (`npm run registry:seed`)
- [x] **Schema + CI validation;** contributions by pull request (`registry/README.md`, an issue
      template for registry facts)
- [x] Parity uses the registry first and falls back to inference (method 1.2.0), and says
      which source it used (`unit_source`, a receipt in the Evidence drawer, the MCP output)
- [ ] Invite issuers to verify their own entries (the `verified_by_issuer` mark exists; the
      outreach doesn't yet)
- [ ] Fill redemption, eligibility and attestations, with sources

**Evals:** schema validation on every PR; contract addresses checked on-chain; unit and ratio
entries cross-checked against observed prices (would have caught per-gram gold and KLAC).
**Measure:** registry coverage (share of tokens with verified units and ratios); outside
contributors; issuers who correct their own entries (the real sign of trust).

## Phase 4: reach, where people buy (3–6 months)

- [x] **Self-hosted MCP** (`npm run mcp`): agents use Parity with their own CoinMarketCap key.
      Evaluated with a real MCP client, and with an AI assistant answering buyer questions
      through it (25/25 on a rubric fixed in advance, no buy advice)
- [x] **The site's own paths are protected:** per-client rate limits and input validation on
      `/api/check`, `?q=` pages and share images; simultaneous identical CMC requests share one
      call; a per-instance cap on live calls falls back to saved data (from a security review)
- **Not doing: a public data API or hosted MCP endpoint.** Built on 7 Oct, then removed:
  CoinMarketCap's API terms allow using their data inside your own product, not
  redistributing it "through your own API". Revisit only with CMC's written permission.
- [ ] **Alerts:** notify when a token's premium jumps or its market dries up
- [ ] **Browser extension:** a Parity badge on swap screens for tokenised assets
- [ ] **X bot:** reply "@parity NVDA" and get the verdict card back
- [ ] One or two wallet or DEX integrations

**Evals:** an agent eval (an LLM answering questions with `check_rwa` must cite the verdict,
state the gaps and never recommend buying; first run 7 Oct: 25/25); alert precision measured against history (how
many alerts were real events); extension tested against recorded swap pages.
**Measure:** weekly repeat users, self-hosted MCP setups (stars, issues, questions), alert
opt-ins, integrations live.

## Phase 5: sustain without losing neutrality (ongoing)

- [ ] Funding that keeps verdicts independent: public-goods grants (Gitcoin, Optimism
      RetroPGF), data-provider grants, and partnerships where wallets use their own CMC licence
      (no paid data API: CoinMarketCap's terms). **Never** issuer payments
      tied to verdicts; all funding disclosed
- [ ] Read DEX pools directly on-chain as well, so Parity doesn't depend on one data provider
- [x] Checked CoinMarketCap's terms (7 Oct): no redistribution. The public API, hosted MCP
      and public history were removed; saved responses in the repo are a question for CMC
- [ ] Public **corrections log:** when Parity is wrong, say so, link the fix and the eval that now covers it

---

## Risks we plan for

| Risk | Answer |
|---|---|
| Being wrong in public | Published method, history, corrections log, golden-set evals |
| Reading as financial advice | Informational wording, tested "no buy" rule, jurisdiction-aware disclaimers |
| Data licensing | Check terms before redistributing; own on-chain reads |
| Single data provider | Registry + direct on-chain data as a second source |
| Issuer pressure | Disclosed funding, open method; verdicts can't be bought |
