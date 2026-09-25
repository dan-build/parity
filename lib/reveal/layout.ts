/**
 * Pure geometry for the instrument: where the scale sits, where every coin lands,
 * how overlapping coins stack. Width in, positions out. No DOM.
 */

export type CoinKind = "coin" | "gram" | "ghost";
export type InstrumentCoinInput = { id: number; premium: number | null; kind: CoinKind };

export type CoinPosition = {
  /** Where the coin's centre ends up. */
  x: number;
  /** Stack level: 0 on the line, 1 on top of one coin, … */
  level: number;
  /** Exact premium on the line (the pin), even when the coin sits on a stack. */
  pinX: number;
};

export type Geometry = {
  width: number;
  mobile: boolean;
  /** Coin diameter. */
  D: number;
  mid: number;
  /** Pixels per 1% of premium. */
  half: number;
  xOf: (premiumPct: number) => number;
  positions: Map<number, CoinPosition>;
  /** Largest pile, for the "3 within 0.15%" note. */
  biggestStack: { x: number; ids: number[] } | null;
  zone: { width: number; centreX: number } | null;
  ticks: { x: number; major: boolean; fromCentre: number }[];
  axis: { x: number; label: string }[];
  /** Vertical lift per stack level. */
  lift: (level: number) => number;
};

export const MOBILE_BELOW = 500;
/** ±1% spans 92% of the scale. */
export const SCALE_SPAN = 0.92;
export const SCALE_LIMIT_PCT = 1;
/** Coins past ±1% pin to just beyond the end of the scale. */
const CLAMP_PCT = 1.02;
/** Piles never grow past this (taller would reach the needle label). */
const MAX_STACK = 3;

export function computeGeometry(width: number, coins: InstrumentCoinInput[]): Geometry {
  const mobile = width < MOBILE_BELOW;
  const hasZone = coins.some((c) => c.kind === "gram");
  const zoneWidth = mobile ? 76 : 132;
  const D = mobile ? 34 : 52;
  // On desktop the scale starts after the red zone and its break mark; on mobile the zone floats above.
  const left = mobile || !hasZone ? (mobile ? 10 : 24) : zoneWidth + 48;
  const right = width - (mobile ? 10 : 24);
  const mid = (left + right) / 2;
  const half = ((right - left) / 2) * SCALE_SPAN;
  const xOf = (p: number) => mid + Math.max(-CLAMP_PCT, Math.min(CLAMP_PCT, p / SCALE_LIMIT_PCT)) * half;
  const lift = (level: number) => level * D * 0.94;

  // Coins that would overlap form a tidy stack on the first coin, in arrival order.
  const positions = new Map<number, CoinPosition>();
  const piles: { x: number; ids: number[] }[] = [];
  for (const c of coins) {
    if (c.kind === "ghost" || c.premium === null) continue;
    const x = xOf(c.premium);
    const near = piles.filter((p) => Math.abs(p.x - x) < D * 0.96);
    const pile = near.find((p) => p.ids.length < MAX_STACK);
    if (!pile && near.length) {
      // Every nearby pile is full: start a new one in the clear spot closest to the coin's true price.
      const clear = (at: number) => !piles.some((p) => Math.abs(p.x - at) < D * 0.96);
      const step = D * 1.02;
      const spot = (dir: number) => {
        let at = near[0].x + dir * step;
        for (let i = 0; i < 12 && !clear(at); i++) at += dir * step;
        return at;
      };
      const [l, r] = [spot(-1), spot(1)];
      const nx = Math.abs(l - x) < Math.abs(r - x) ? l : r;
      piles.push({ x: nx, ids: [c.id] });
      positions.set(c.id, { x: nx, level: 0, pinX: x });
    } else if (pile) {
      positions.set(c.id, { x: pile.x, level: pile.ids.length, pinX: x });
      pile.ids.push(c.id);
    } else {
      piles.push({ x, ids: [c.id] });
      positions.set(c.id, { x, level: 0, pinX: x });
    }
  }
  // Ghosts land side by side at the needle, then fall through.
  const ghosts = coins.filter((c) => c.kind === "ghost");
  ghosts.forEach((g, i) => {
    const x = mid + (i - (ghosts.length - 1) / 2) * D * 0.7;
    positions.set(g.id, { x, level: 0, pinX: x });
  });

  const biggest = piles.reduce<{ x: number; ids: number[] } | null>((b, p) => (!b || p.ids.length > b.ids.length ? p : b), null);

  const ticks = [];
  for (let k = -10; k <= 10; k++) ticks.push({ x: xOf(k / 10), major: k % 5 === 0, fromCentre: Math.abs(k) });
  const axis = [-1, -0.5, 0.5, 1].map((p) => ({ x: xOf(p), label: `${p > 0 ? "+" : "−"}${Math.abs(p)}%` }));

  return {
    width,
    mobile,
    D,
    mid,
    half,
    xOf,
    positions,
    biggestStack: biggest && biggest.ids.length > 1 ? biggest : null,
    zone: hasZone ? { width: zoneWidth, centreX: zoneWidth / 2 } : null,
    ticks,
    axis,
    lift,
  };
}
