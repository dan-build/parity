"use client";

/**
 * The instrument. Every token is a coin dropped onto one line centred on the typical
 * price. Fair coins stack by the needle, the overpriced one gets a callout, per-gram
 * coins land tiny in the red zone then grow and roll to their true price, ghosts fall
 * through the line. Geometry comes from lib/reveal/layout.ts, timing from timings.ts.
 * Behaviour only: the caller supplies the styles (a CSS module with these class names)
 * and the coin component.
 */
import { useLayoutEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties, type ReactNode, type Ref } from "react";
import type { View } from "@/lib/present";
import { computeGeometry, type GeometryOptions } from "@/lib/reveal/layout";
import { drop, eased, spring } from "@/lib/reveal/motion";
import { SPRING, T } from "@/lib/reveal/timings";
import { useTrack } from "./Reveal";

export type CoinProps = {
  size: number;
  ticker?: string | null;
  variant?: "gold" | "ghost" | "rich";
  ref?: Ref<HTMLSpanElement>;
  style?: CSSProperties;
};

type Styles = Record<string, string>;
type CoinEls = { wrap: HTMLElement | null; coin: HTMLElement | null; shadow: HTMLElement | null; pin: HTMLElement | null };

export function Instrument({
  view,
  s,
  Coin,
  line,
  mobileZoneLift,
  geometry,
  label,
  zone,
  ariaNoun,
}: {
  view: View;
  s: Styles;
  Coin: ComponentType<CoinProps>;
  /** px from the instrument's bottom edge to the line (matches .c bottom in CSS). */
  line: number;
  /** On phones the zone floats above the line; per-gram coins sit this much higher inside it. */
  mobileZoneLift: number;
  geometry?: GeometryOptions;
  label: ReactNode;
  zone?: ReactNode;
  ariaNoun: string;
}) {
  const { coins, callout, ghostNote } = view.instrument;
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => (width ? computeGeometry(width, coins, geometry) : null), [width, coins, geometry]);

  const schedule = useMemo(() => {
    const plain = coins.filter((c) => c.kind === "coin");
    const stagger = plain.length > 1 ? Math.min(T.coins.stagger, T.coins.maxSpan / (plain.length - 1)) : 0;
    const out = new Map<number, { start: number; index: number }>();
    plain.forEach((c, i) => out.set(c.id, { start: T.coins.start + i * stagger, index: i }));
    coins.filter((c) => c.kind === "gram").forEach((c, j) => out.set(c.id, { start: T.perGram.start + j * T.perGram.stagger, index: j }));
    coins.filter((c) => c.kind === "ghost").forEach((c, g) => out.set(c.id, { start: T.ghost.start + g * T.ghost.stagger, index: g }));
    return out;
  }, [coins]);

  const trackRef = useRef<HTMLDivElement>(null);
  const ticksRef = useRef<HTMLDivElement>(null);
  const axisRef = useRef<HTMLDivElement>(null);
  const needleRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const calloutRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const coinEls = useRef(new Map<number, CoinEls>());
  const refFor = (id: number, key: keyof CoinEls) => (el: HTMLElement | null) => {
    const map = coinEls.current;
    const e = map.get(id) ?? { wrap: null, coin: null, shadow: null, pin: null };
    (e as Record<keyof CoinEls, HTMLElement | null>)[key] = el;
    map.set(id, e);
  };

  useTrack(
    (t) => {
      if (!geo) return;
      const { D, mid, positions, lift, mobile, width: W } = geo;
      if (trackRef.current) trackRef.current.style.transform = `scaleX(${eased(t, T.track.start, T.track.dur)})`;
      ticksRef.current?.querySelectorAll<HTMLElement>("i").forEach((i) => {
        i.style.opacity = String(eased(t, T.ticks.start + Number(i.dataset.k) * T.ticks.perTickFromCentre, T.ticks.dur));
      });
      if (axisRef.current) axisRef.current.style.opacity = String(eased(t, T.axis.start, T.axis.dur));
      if (needleRef.current) needleRef.current.style.transform = `scaleY(${spring(t, T.needle.start, SPRING.SOFT)})`;
      if (labelRef.current) {
        labelRef.current.style.opacity = String(eased(t, T.needleLabel.start, T.needleLabel.fadeDur));
        labelRef.current.style.transform = `translate(-50%, ${(1 - spring(t, T.needleLabel.start, SPRING.SNAP)) * T.needleLabel.dropPx}px)`;
      }
      if (zoneRef.current) {
        // On phones the zone floats over the scale; once the per-gram coins roll out it steps back.
        const back = mobile ? 0.7 * eased(t, T.perGram.growStart + T.perGram.growDur, 300) : 0;
        zoneRef.current.style.opacity = String(eased(t, T.zone.start, T.zone.dur) * (1 - back));
      }

      for (const c of coins) {
        const e = coinEls.current.get(c.id);
        const p = positions.get(c.id);
        const sch = schedule.get(c.id);
        if (!e?.wrap || !e.coin || !p || !sch) continue;
        if (c.kind === "ghost") {
          const d = drop(t, sch.start, T.ghost.dropPx);
          const fall = eased(t, T.ghost.fallStart + sch.index * T.ghost.stagger, T.ghost.fallDur);
          e.wrap.style.transform = `translate(${p.x - D / 2}px, ${d.y + fall * T.ghost.fallPx}px)`;
          e.wrap.style.opacity = String((d.visible ? 1 : 0) * (1 - fall * (1 - T.ghost.fadeTo)));
          if (e.shadow) e.shadow.style.opacity = String((t > sch.start + T.drop.fall ? 1 : 0) * (1 - fall));
          continue;
        }
        if (c.kind === "gram") {
          const d = drop(t, sch.start, T.perGram.dropPx);
          const zx = (geo.zone?.centreX ?? 40) - 8 + (sch.index % 3) * (mobile ? 12 : 18);
          const go = T.perGram.growStart + sch.index * T.perGram.stagger;
          const m = spring(t, go, SPRING.SETTLE);
          const g = eased(t, go, T.perGram.growDur);
          const x = zx + (p.x - zx) * m;
          const scale = T.perGram.startScale + (1 - T.perGram.startScale) * g;
          const y = (d.y - (mobile ? mobileZoneLift : 0)) * (1 - g) - lift(p.level) * m;
          e.wrap.style.transform = `translate(${x - D / 2}px, ${y}px)`;
          e.coin.style.transform = `scale(${scale}) rotate(${-(1 - m) * T.perGram.rollDeg}deg)`;
          e.wrap.style.opacity = d.visible ? "1" : "0";
          if (e.shadow) e.shadow.style.opacity = String((t > sch.start + T.drop.fall ? 1 : 0) * (p.level && m > 0.9 ? 0 : 1) * scale);
        } else {
          const d = drop(t, sch.start, T.coins.dropPx + lift(p.level));
          e.wrap.style.transform = `translate(${p.x - D / 2}px, ${d.y - lift(p.level)}px)`;
          e.wrap.style.opacity = d.visible ? "1" : "0";
          if (e.shadow) e.shadow.style.opacity = t > sch.start + T.drop.fall && p.level === 0 ? "1" : "0";
        }
        if (e.pin) {
          const a = spring(t, c.kind === "gram" ? T.pins.perGramStart : sch.start + T.pins.afterLand, SPRING.SNAP);
          e.pin.style.transform = `scale(${a})`;
          e.pin.style.opacity = String(Math.min(1, a * 2));
        }
      }

      if (stackRef.current && geo.biggestStack) {
        const b = geo.biggestStack;
        stackRef.current.style.left = `${b.x + D / 2 + 12}px`;
        stackRef.current.style.bottom = `${line + lift(b.ids.length - 1) + D / 2 - 8}px`;
        stackRef.current.style.opacity = String(eased(t, T.stackNote.start, T.stackNote.dur));
      }
      if (calloutRef.current && callout) {
        const p = positions.get(callout.id);
        if (p) {
          const up = (1 - spring(t, T.callout.start, SPRING.SNAP)) * T.callout.risePx;
          calloutRef.current.style.opacity = String(eased(t, T.callout.start, T.callout.dur));
          const el = calloutRef.current;
          if (mobile) {
            el.style.left = `${Math.min(Math.max(p.x, 70), W - 70)}px`;
            el.style.right = "auto";
            el.style.transform = `translate(-50%, ${-D - 12 - lift(p.level) + up}px)`;
          } else {
            const roomRight = W - (p.x + D / 2 + 10) > 170;
            el.style.left = roomRight ? `${p.x + D / 2 + 10}px` : "auto";
            el.style.right = roomRight ? "auto" : `${W - (p.x - D / 2 - 10)}px`;
            el.style.transform = `translateY(${-D / 2 + 12 - lift(p.level) + up}px)`;
          }
        }
      }
      if (ghostRef.current) {
        ghostRef.current.style.left = `${mid}px`;
        ghostRef.current.style.opacity = String(eased(t, T.ghostNote.start, T.ghostNote.dur));
      }
    },
    [geo, coins, schedule, callout],
  );

  const priced = coins.filter((c) => c.premium !== null);
  const aria = `Each ${ariaNoun} token's price against the typical price: ${priced
    .map((c) => `${c.ticker} ${(c.premium ?? 0) >= 0 ? "+" : "−"}${Math.abs(c.premium ?? 0).toFixed(2)}%`)
    .join(", ")}.`;

  return (
    <div ref={box} className={s.instrument} role="img" aria-label={aria}>
      {geo && (
        <>
          {geo.zone && zone && (
            <div ref={zoneRef} className={s.zone}>
              {zone}
            </div>
          )}
          <div ref={trackRef} className={s.track} />
          <div ref={ticksRef} className={s.ticks}>
            {geo.ticks.map((k, i) => (
              <i key={i} data-k={k.fromCentre} className={k.major ? s.major : undefined} style={{ left: k.x }} />
            ))}
          </div>
          <div ref={axisRef} className={s.axis}>
            {geo.axis.map((a) => (
              <span key={a.label} style={{ left: a.x }}>
                {a.label}
              </span>
            ))}
          </div>
          <div ref={needleRef} className={s.needle} style={{ left: geo.mid }} />
          <div ref={labelRef} className={s.needleLabel} style={{ left: geo.mid }}>
            {label}
          </div>
          {coins.map((c) => {
            const p = geo.positions.get(c.id);
            return (
              <div key={c.id}>
                <div ref={refFor(c.id, "wrap")} className={s.c}>
                  <span ref={refFor(c.id, "shadow")} className={s.shadow} />
                  <Coin
                    ref={refFor(c.id, "coin")}
                    size={geo.D}
                    ticker={c.ticker}
                    variant={c.kind === "ghost" ? "ghost" : c.verdict === "RICH" ? "rich" : "gold"}
                    style={c.kind === "gram" ? { transformOrigin: "50% 100%" } : undefined}
                  />
                </div>
                {c.kind !== "ghost" && p && <span ref={refFor(c.id, "pin")} className={`${s.pin} ${s[c.verdict] ?? ""}`} style={{ left: p.pinX }} />}
              </div>
            );
          })}
          {geo.biggestStack && geo.biggestStack.ids.length >= 3 && (
            <div ref={stackRef} className={s.stackNote}>
              {view.instrument.stackNote(geo.biggestStack.ids.length, geo.biggestStack.ids)}
            </div>
          )}
          {callout && (
            <div ref={calloutRef} className={s.callout}>
              {callout.text}
            </div>
          )}
          {ghostNote && (
            <div ref={ghostRef} className={s.ghostNote}>
              {ghostNote}
            </div>
          )}
        </>
      )}
    </div>
  );
}
