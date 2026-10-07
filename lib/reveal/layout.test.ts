import { describe, expect, it } from "vitest";
import { computeGeometry, SCALE_SPAN, tipAlign, type InstrumentCoinInput } from "./layout";
import { SPRING, T } from "./timings";
import { drop, spring } from "./motion";

const coin = (id: number, premium: number | null, kind: InstrumentCoinInput["kind"] = "coin"): InstrumentCoinInput => ({ id, premium, kind });

describe("computeGeometry", () => {
  it("puts 0% at the centre and ±1% at 92% of the scale", () => {
    const g = computeGeometry(1000, [coin(1, 0)]);
    const left = 24;
    const right = 1000 - 24;
    expect(g.mid).toBe((left + right) / 2);
    expect(g.xOf(1) - g.mid).toBeCloseTo(((right - left) / 2) * SCALE_SPAN, 6);
    expect(g.xOf(5)).toBe(g.xOf(1.02)); // clamped just past the end
  });

  it("stacks overlapping coins on the first one, max 3 high, pins keep exact prices", () => {
    const g = computeGeometry(1000, [coin(1, 0.01), coin(2, 0.02), coin(3, 0.03), coin(4, 0.04)]);
    const p = [1, 2, 3, 4].map((id) => g.positions.get(id)!);
    expect(p.slice(0, 3).map((x) => x.level)).toEqual([0, 1, 2]);
    expect(p[1].x).toBe(p[0].x);
    expect(p[1].pinX).toBe(g.xOf(0.02));
    // The 4th starts a new pile in clear space, never on top of another coin.
    expect(p[3].level).toBe(0);
    expect(Math.abs(p[3].x - p[0].x)).toBeGreaterThanOrEqual(g.D * 0.96);
    expect(g.biggestStack?.ids).toEqual([1, 2, 3]);
  });

  it("only has a red zone when there are per-gram coins, and uses phone sizes under 500px", () => {
    expect(computeGeometry(1000, [coin(1, 0)]).zone).toBeNull();
    const g = computeGeometry(360, [coin(1, 0), coin(2, 0.1, "gram")]);
    expect(g.zone).not.toBeNull();
    expect(g.mobile).toBe(true);
    expect(g.D).toBe(34);
  });

  it("lands ghosts at the needle", () => {
    const g = computeGeometry(1000, [coin(1, 0.2), coin(9, null, "ghost")]);
    expect(g.positions.get(9)!.x).toBe(g.mid);
  });
});

describe("timeline", () => {
  it("runs in the design's order and finishes by the end of the clock", () => {
    const order = [
      T.track.start,
      T.needle.start,
      T.coins.start,
      T.perGram.start,
      T.ghost.start,
      T.callout.start,
      T.perGram.growStart,
      T.ghost.fallStart,
      T.checkingOut.start,
      T.verdict.start,
      T.aurora.start,
      T.medal.start,
      T.reasons.start,
      T.rows.start,
      T.route.start,
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(T.route.start + 600).toBeLessThanOrEqual(T.end);
  });

  it("springs settle to 1 and drops land at 0", () => {
    expect(spring(T.end, 0, SPRING.MEDAL)).toBeCloseTo(1, 3);
    expect(spring(0, 100, SPRING.SOFT)).toBe(0);
    expect(drop(0, 100, 170)).toEqual({ y: -170, visible: false });
    expect(drop(2000, 100, 170).y).toBeCloseTo(0, 3);
  });
});

describe("tipAlign", () => {
  const long = "CGO · −0.93% vs spot · priced per gram"; // ~290px
  it("centres a tooltip with room on both sides", () => {
    expect(tipAlign(600, 1200, long)).toBe("center");
  });
  it("grows inward near the left and right edges", () => {
    expect(tipAlign(40, 1200, long)).toBe("start");
    expect(tipAlign(1180, 1200, long)).toBe("end");
  });
  it("gives short tooltips more room before shifting", () => {
    expect(tipAlign(60, 1200, "XAUt")).toBe("center");
  });
});
