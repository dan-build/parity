# Parity design spec (v2)

Source of truth: `parity-design.html` in this folder. Open it in a browser to watch the
reveal (bottom-left "Replay reveal"), and read its code for exact values. The PNGs are
static references. All numbers are sample data; the app renders `/api/check`.

## The idea
Every token that claims to be gold is a real gold coin. The app drops them onto one line,
"Real gold", and you watch the truth sort itself out: fair coins land by the needle and
stack, the overpriced one gets a red ring, the per-gram coins land tiny in a red
"looks 97% cheaper" zone and then grow into full ounces and roll to their true price,
and the ghost listing falls straight through the line. Then the verdict lands.

Calm, bright, premium surfaces. All the richness lives in the coins and one verdict moment.

## Tokens
Surfaces
- canvas `#F2F2F4` with a soft white glow at the top of the page
- surface `#FFFFFF`, radius 32 (26 on mobile), shadow: hairline ring `rgba(10,10,20,.07)`
  + layered soft drop `0 24px 48px -24px rgba(10,10,20,.16)`
- ink `#0A0A0B`, ink-2 `#3A3A3F`, mute `#76767C`, faint `#AEAEB4`

Gold (only on coins, ingots, the track)
- `#FFF4C9` → `#F4D47C` → `#D9A73C` → `#A8751A` → `#6E4A0C`

Verdicts (text on tinted background)
- Fair `#07A66B` on `#E6F7EF` (medal gradient `#E9FFF4 → #7DF0C0 → #16C27F → #07905C → #045238`)
- Rich `#E5234B` on `#FFE9ED`
- Thin `#C77A00` on `#FFF3D9`
- Ghost `#8E8E95`, always a dashed outline, never filled

Type (next/font/google)
- Instrument Sans 400/500/600/700 for everything. Geist Mono only in the Evidence drawer.
- Verdict word 172px / 112px mobile, weight 700, letter-spacing −0.055em, line-height 0.8
- Verdict sub 34/25 weight 500 mute. Section titles 22 weight 600 −0.03em. Body 16.
- `font-variant-numeric: tabular-nums` everywhere.

## The coin (signature component)
A circle with: a specular highlight at 32% 26%, a radial gold body, an inner rim ring
(inset 13%, 1px darker gold line), an inset light ring on the edge, a dark inset at the
bottom for thickness, and a warm drop shadow. The ticker is embossed in dark gold
`#5E3E08` with a 1px light text-shadow below. Size scales with `--d`; ticker font is
20% of the diameter (16% for 5-letter tickers). Ghost coin: translucent white with a
dashed grey border and "?". Overpriced coin: 2px rose outline, 3px offset.
Build it as one `<Coin size ticker variant>` component and reuse it everywhere
(header asset icon, instrument, list rows, best-route card, empty state).

## Layout
1. Header: two stacked gold ingots + "parity" (700, −0.035em). Right: mood pill with a
   tiny green arc gauge, "Crypto mood Greed 73" (Fear & Greed endpoint).
2. Search: centered 720px white capsule, 60px, ⌘K hint, black "Check" pill; chips below.
3. Hero card (one white card) with a mint and gold aurora glowing from the top-left:
   - left: coin + "Gold, 6 tokens claim to be it", the verdict word + glossy check
     medal, sub-line "if you pick the right token."
   - right: 4 reasons, each with a tinted rounded-square icon; bold fact + plain rest
   - bottom, full width: the instrument
4. The instrument: gold track with fine ticks every 0.1% (major every 0.5%), axis labels
   −1% … +1%, a black needle at the average price with a black label pill
   "Real gold $4,285.02". ±1% spans 92% of the scale. Coins that would overlap form a
   tidy stack on the first coin ("3 within 0.15%" note beside it); a small coloured pin
   on the line keeps each coin's exact premium. A hatched rose zone on the far left,
   separated by a small break mark, holds the per-gram coins before conversion.
   Callout pill beside the overpriced coin: "+0.77%, $33 extra".
   The ghost note sits under the axis: "GOLD (derivative listing) has no price".
5. List card "Every token that claims to be gold": coin, ticker + issuer/chain, ounce
   price (per-gram rows add "Converted from $137.88 per gram" in gold), premium chip,
   exit meter (5 rising bars + "Deep exit"), verdict badge with glyph. Rows are
   rounded, hover to `#F7F7F9`.
6. Lower: a black "Best way in today" card (gold and mint glows, big coin, 3 stats) next
   to a white "What the data can't tell you" card. Fine print centered below.
7. Evidence: floating black glass pill centred at the bottom ("● Evidence 7"). Opens a
   black drawer from the right (bottom sheet at 84vh on mobile) over a blurred scrim.

Mobile (<760px): hero stacks, instrument keeps the same idea at 34px coins with the
red zone floating above the left end, list rows become 3-line cards, chips scroll
horizontally, evidence pill is full width.

Empty state: coin row (PAXG, XAUt, CGO, ghost "?"), 56px headline "Is your tokenised
gold actually gold?", search, chips.

## Motion (runs on every new result, about 3.3s)
Transform and opacity only. Presets (stiffness/damping, mass 1): SNAP 420/24,
SETTLE 190/19, SOFT 260/24, MEDAL 380/16 (bouncy).

| Time | What happens |
|---|---|
| 0 | "Weighing 6 tokens" with a moving shimmer across the text |
| 80ms | Track draws out from the centre (520ms, ease-out cubic); ticks fade outward from the middle |
| 300ms | Needle grows up (SOFT); label pill drops in at 480ms (SNAP) |
| 560–880ms | Coins drop from above with gravity (210ms ease-in) then two small decaying bounces. Stacked coins land on top of the pile |
| 760ms, 880ms | Per-gram coins drop in at 26% size into the red zone |
| 980ms | Ghost coin lands on the line at the needle |
| 1180ms | Overpriced callout pops (SNAP) |
| 1320ms, 1440ms | Per-gram coins grow to full size while travelling (SETTLE) to their true price, rolling 540° and ending upright, landing on the stack |
| 1620ms | Ghost falls through the line (56px, fades to 20%); its note fades in at 1900ms |
| 1700ms+ | Pins pop onto the line under each coin |
| 2000ms | "Weighing" lifts and fades |
| 2080ms | Verdict rises 26px (SOFT) |
| 2150ms | Aurora blooms (1100ms) |
| 2260ms | Medal pops from 0 with a −30° twist (MEDAL). The moment |
| 2300ms + 80ms | Reasons rise in |
| 2450ms + 60ms | List rows rise in |
| 2750ms | Best-route card settles (SOFT) |

Interaction: buttons/chips press to 0.96; drawer slides 500ms cubic-bezier(.22,1,.36,1);
reduced motion shows the final state instantly. Optional: `navigator.vibrate(8)` when
the medal lands, on supported phones.

Implementation: one `<Reveal>` component driven by a single clock, like `frame(t)` in the
reference, or Framer Motion with the same presets and delays. Keep the timings in one
constants file so they can be tuned.

## Copy rules
Sentence case, plain words. Reasons are facts with numbers. Failures say what is missing
and why. No jargon a first-time buyer wouldn't know.
