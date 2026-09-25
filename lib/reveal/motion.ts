/** Motion maths for the reveal. Every function is pure: value = f(t). */
import { T, type Spring } from "./timings";

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));

/** Ease-out cubic. */
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x), 3);

/** Linear progress 0→1 of a segment starting at `start` lasting `dur`. */
export const progress = (t: number, start: number, dur: number) => clamp((t - start) / dur);

/** Eased progress of a segment. */
export const eased = (t: number, start: number, dur: number) => easeOut(progress(t, start, dur));

/** Damped spring from 0 → 1 (can overshoot), starting at `start` ms. */
export function spring(t: number, start: number, { k, c }: Spring): number {
  const s = (t - start) / 1000;
  if (s <= 0) return 0;
  const w = Math.sqrt(k);
  const z = c / (2 * w);
  if (z < 1) {
    const wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * s) * (Math.cos(wd * s) + ((z * w) / wd) * Math.sin(wd * s));
  }
  return 1 - Math.exp(-w * s) * (1 + w * s);
}

/**
 * A coin drop from `height` px above: gravity fall, then two small decaying bounces.
 * Returns y offset (negative is up) and whether the coin is visible yet.
 */
export function drop(t: number, start: number, height: number): { y: number; visible: boolean } {
  const { fall, bouncePx, bouncePeriod, bounceDecay } = T.drop;
  if (t < start) return { y: -height, visible: false };
  if (t < start + fall) {
    const q = (t - start) / fall;
    return { y: -height * (1 - q * q), visible: true };
  }
  const u = t - start - fall;
  return { y: -Math.abs(Math.sin((u / bouncePeriod) * Math.PI)) * bouncePx * Math.exp(-u / bounceDecay), visible: true };
}
