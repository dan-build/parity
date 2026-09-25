/**
 * Every timing in the reveal, in ms from the moment a result arrives.
 * Mirrors the table in design/DESIGN.md. Tune here, nowhere else.
 */

/** Spring presets (stiffness, damping; mass 1). */
export const SPRING = {
  SNAP: { k: 420, c: 24 },
  SETTLE: { k: 190, c: 19 },
  SOFT: { k: 260, c: 24 },
  MEDAL: { k: 380, c: 16 },
} as const;
export type Spring = (typeof SPRING)[keyof typeof SPRING];

export const T = {
  /** "Weighing N tokens" shimmer: background moves 1% per this many ms. */
  shimmerMsPerPct: 6,

  track: { start: 80, dur: 520 },
  ticks: { start: 260, perTickFromCentre: 18, dur: 200 },
  axis: { start: 500, dur: 300 },
  needle: { start: 300 },
  needleLabel: { start: 480, fadeDur: 240, dropPx: 10 },
  zone: { start: 640, dur: 260 },

  /** Priced coins drop onto the line (or the pile). Staggers compress when there are many. */
  coins: { start: 560, stagger: 120, maxSpan: 360, dropPx: 170 },
  /** A drop: gravity fall, then two small decaying bounces. */
  drop: { fall: 210, bouncePx: 16, bouncePeriod: 95, bounceDecay: 120 },

  /** Per-gram coins: land tiny in the red zone, then grow to ounces and roll to their price. */
  perGram: { start: 760, stagger: 120, dropPx: 120, startScale: 0.26, growStart: 1320, growDur: 520, rollDeg: 540 },

  ghost: { start: 980, stagger: 90, dropPx: 150, fallStart: 1620, fallDur: 520, fallPx: 56, fadeTo: 0.2 },
  ghostNote: { start: 1900, dur: 300 },

  callout: { start: 1180, dur: 260, risePx: 6 },
  /** Pins pop under each coin this long after it lands; per-gram pins wait for the roll. */
  pins: { afterLand: 200, perGramStart: 1700 },
  stackNote: { start: 1900, dur: 300 },

  checkingOut: { start: 2000, dur: 200, liftPx: 10 },
  verdict: { start: 2080, fadeDur: 240, risePx: 26 },
  aurora: { start: 2150, dur: 1100 },
  medal: { start: 2260, twistDeg: -30, vibrateAt: 2400 },
  reasons: { start: 2300, stagger: 80, dur: 320, risePx: 10 },
  rows: { start: 2450, stagger: 60, dur: 320, risePx: 12 },
  route: { start: 2750, fadeDur: 260, risePx: 16 },

  /** The clock stops after this. */
  end: 3600,
} as const;

/** Any t at or beyond this renders the settled final state (used for reduced motion). */
export const FINAL = 100_000;
