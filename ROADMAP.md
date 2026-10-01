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
- [ ] **Scheduled snapshots:** a cron job saves live results every few minutes; pages read
      snapshots instead of calling the API per visitor, so costs stay flat as traffic grows
- [ ] **Daily history** per token: premium, volume and exit over time
- [x] **Open-source hygiene:** LICENSE (MIT), CONTRIBUTING.md, issue and PR templates
- [x] **CI** (GitHub Actions): lint, types, tests, eval and build on every push and PR
- [ ] "good first issue" labels on a few starter issues

**Evals:** the golden set passes in CI; a method change without a changelog entry fails CI;
snapshot freshness is monitored (alert when older than 15 minutes).
**Measure:** API credits per 1,000 page views (should fall sharply); time from push to deploy.

## Phase 2: the real price (1–2 months)

**Goal:** answer "is this token worth what it claims?", not only "do the tokens agree?".

- [ ] **Reference prices:** the real share price for stocks (with market-hours awareness:
      tokens trade 24/7, stocks don't) and the spot price for gold and silver
- [ ] Show premium against the real price alongside premium against the other tokens
- [ ] "What the data can't tell you" drops "the real price" when it's covered

**Evals:** tracking error of each token against its reference price over the history
(flags tokens that drift); a backtest over saved history checks verdicts wouldn't flip-flop
hour to hour (verdict stability rate); weekend and after-hours cases in the golden set.
**Measure:** share of verdicts where the reference price changes the answer.

## Phase 3: the open registry (1–3 months, alongside Phase 2)

**Goal:** the dataset everyone else needs, and the thing Parity becomes known for.

- [ ] **`registry/`:** one JSON file per tokenised asset, recording for each token its unit and
      share ratio (per gram? 0.1 share?), chains and contracts, issuer, redemption terms, who
      can hold it (KYC, jurisdictions), and links to proof-of-reserve and attestations
- [ ] **Schema + CI validation;** contributions by pull request, like token lists
- [ ] Parity uses the registry first and falls back to inference (the per-gram detection),
      showing which source it used
- [ ] Invite issuers to verify their own entries (a "verified by issuer" mark)

**Evals:** schema validation on every PR; contract addresses checked on-chain; unit and ratio
entries cross-checked against observed prices (would have caught per-gram gold and KLAC).
**Measure:** registry coverage (share of tokens with verified units and ratios); outside
contributors; issuers who correct their own entries (the real sign of trust).

## Phase 4: reach, where people buy (3–6 months)

- [ ] **Public API + hosted MCP endpoint** (HTTP), rate-limited, so wallets and agents don't
      need to run anything
- [ ] **Alerts:** notify when a token's premium jumps or its market dries up
- [ ] **Browser extension:** a Parity badge on swap screens for tokenised assets
- [ ] **X bot:** reply "@parity NVDA" and get the verdict card back
- [ ] One or two wallet or DEX integrations

**Evals:** an agent eval (an LLM answering questions with `check_rwa` must cite the verdict,
state the gaps and never recommend buying); alert precision measured against history (how
many alerts were real events); extension tested against recorded swap pages.
**Measure:** weekly repeat users, API/MCP calls, alert opt-ins, integrations live.

## Phase 5: sustain without losing neutrality (ongoing)

- [ ] Funding that keeps verdicts independent: public-goods grants (Gitcoin, Optimism
      RetroPGF), data-provider grants, paid API tiers for wallets. **Never** issuer payments
      tied to verdicts; all funding disclosed
- [ ] Read DEX pools directly on-chain as well, so Parity doesn't depend on one data provider
- [ ] Check CoinMarketCap's terms before redistributing any data (snapshots, API)
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
