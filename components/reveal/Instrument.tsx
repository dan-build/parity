"use client";

/**
 * The instrument. Every token is a coin dropped onto one line centred on the typical
 * price. Fair coins stack by the needle, the overpriced one gets a red ring, per-gram
 * coins land tiny in the red zone then grow and roll to their true price, ghosts fall
 * through the line. Geometry comes from lib/reveal/layout.ts, timing from timings.ts.
 */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { View } from "@/lib/present";
import { computeGeometry } from "@/lib/reveal/layout";
import { drop, eased, spring } from "@/lib/reveal/motion";
import { SPRING, T } from "@/lib/reveal/timings";
import { Coin } from "../Coin";
import { BreakMark } from "../icons";
import { useTrack } from "./Reveal";
import s from "./Instrument.module.css";

type CoinEls = { wrap: HTMLDivElement | null; coin: HTMLSpanElement | null; shadow: HTMLSpanElement | null; pin: HTMLSpanElement | null };

/** Line height above the instrument's bottom edge, in px (matches .c bottom). */
const LINE = 79;
/** On phones the red zone floats above the line; per-gram coins sit inside it. */
const MOBILE_ZONE_LIFT = 29;

export function Instrument({ view }: { view: View }) {
  const { coins, reference, zone, callout, ghostNote } = view.instrument;
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

  const geo = useMemo(() => (width ? computeGeometry(width, coins) : null), [width, coins]);

  // Per-coin schedule: order of arrival within each kind.
  const schedule = useMemo(() => {
    const plain = coins.filter((c) => c.kind === "coin");
    const stagger = plain.length > 1 ? Math.min(T.coins.stagger, T.coins.maxSpan / (plain.length - 1)) : 0;
    const out = new Map<number, { start: number; index: number }>();
    plain.forEach((c, i) => out.set(c.id, { start: T.coins.start + i * stagger, index: i }));
    coins.filter((c) => c.kind === "gram").forEach((c, j) => out.set(c.id, { start: T.perGram.start + j * T.perGram.stagger, index: j }));
    coins.filter((c) => c.kind === "ghost").forEach((c, g) => out.set(c.id, { start: T.ghost.start + g * T.ghost.stagger, index: g }));
    return out;
  }, [coins]);

  const track = useRef<HTMLDivElement>(null);
  const ticks = useRef<HTMLDivElement>(null);
  const axis = useRef<HTMLDivElement>(null);
  const needle = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const zoneEl = useRef<HTMLDivElement>(null);
  const breakEl = useRef<HTMLDivElement>(null);
  const stackNote = useRef<HTMLDivElement>(null);
  const calloutEl = useRef<HTMLDivElement>(null);
  const ghostNoteEl = useRef<HTMLDivElement>(null);
  const coinEls = useRef(new Map<number, CoinEls>());
  /** Ref-callback factory: stores each coin's elements by crypto_id. */
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

      // The line draws out from the centre; ticks fade outward; the needle grows; the label drops in.
      if (track.current) track.current.style.transform = `scaleX(${eased(t, T.track.start, T.track.dur)})`;
      ticks.current?.querySelectorAll<HTMLElement>("i").forEach((i) => {
        const k = Number(i.dataset.k);
        i.style.opacity = String(eased(t, T.ticks.start + k * T.ticks.perTickFromCentre, T.ticks.dur));
      });
      if (axis.current) axis.current.style.opacity = String(eased(t, T.axis.start, T.axis.dur));
      if (needle.current) needle.current.style.transform = `scaleY(${spring(t, T.needle.start, SPRING.SOFT)})`;
      if (label.current) {
        label.current.style.opacity = String(eased(t, T.needleLabel.start, T.needleLabel.fadeDur));
        label.current.style.transform = `translate(-50%, ${(1 - spring(t, T.needleLabel.start, SPRING.SNAP)) * T.needleLabel.dropPx}px)`;
      }
      const z = eased(t, T.zone.start, T.zone.dur);
      if (zoneEl.current) zoneEl.current.style.opacity = String(z);
      if (breakEl.current) breakEl.current.style.opacity = String(z);

      for (const c of coins) {
        const e = coinEls.current.get(c.id);
        const p = positions.get(c.id);
        const sch = schedule.get(c.id);
        if (!e?.wrap || !e.coin || !p || !sch) continue;

        if (c.kind === "ghost") {
          // Lands on the line at the needle, then falls through it.
          const d = drop(t, sch.start, T.ghost.dropPx);
          const fall = eased(t, T.ghost.fallStart + sch.index * T.ghost.stagger, T.ghost.fallDur);
          e.wrap.style.transform = `translate(${p.x - D / 2}px, ${d.y + fall * T.ghost.fallPx}px)`;
          e.wrap.style.opacity = String((d.visible ? 1 : 0) * (1 - fall * (1 - T.ghost.fadeTo)));
          if (e.shadow) e.shadow.style.opacity = String((t > sch.start + T.drop.fall ? 1 : 0) * (1 - fall));
          continue;
        }

        if (c.kind === "gram") {
          // Tiny coin drops into the red zone…
          const d = drop(t, sch.start, T.perGram.dropPx);
          const zx = (geo.zone?.centreX ?? 40) - 8 + (sch.index % 3) * (mobile ? 12 : 18);
          const go = T.perGram.growStart + sch.index * T.perGram.stagger;
          // …then grows to full size while travelling to its true price, rolling upright.
          const m = spring(t, go, SPRING.SETTLE);
          const g = eased(t, go, T.perGram.growDur);
          const x = zx + (p.x - zx) * m;
          const scale = T.perGram.startScale + (1 - T.perGram.startScale) * g;
          const zoneLift = mobile ? MOBILE_ZONE_LIFT : 0;
          const y = (d.y - zoneLift) * (1 - g) - lift(p.level) * m;
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

        // A pin on the line keeps each coin's exact premium, even when it sits on a pile.
        if (e.pin) {
          const at = c.kind === "gram" ? T.pins.perGramStart : sch.start + T.pins.afterLand;
          const a = spring(t, at, SPRING.SNAP);
          e.pin.style.transform = `scale(${a})`;
          e.pin.style.opacity = String(Math.min(1, a * 2));
        }
      }

      // "3 within 0.15%" beside the biggest pile.
      if (stackNote.current && geo.biggestStack) {
        const b = geo.biggestStack;
        stackNote.current.style.left = `${b.x + D / 2 + 12}px`;
        stackNote.current.style.bottom = `${LINE + lift(b.ids.length - 1) + D / 2 - 9}px`;
        stackNote.current.style.opacity = String(eased(t, T.stackNote.start, T.stackNote.dur));
      }

      // "+0.77%, $33 extra" beside the overpriced coin.
      if (calloutEl.current && callout) {
        const p = positions.get(callout.id);
        if (p) {
          const up = (1 - spring(t, T.callout.start, SPRING.SNAP)) * T.callout.risePx;
          calloutEl.current.style.opacity = String(eased(t, T.callout.start, T.callout.dur));
          if (mobile) {
            calloutEl.current.style.left = `${Math.min(Math.max(p.x, 70), W - 70)}px`;
            calloutEl.current.style.right = "auto";
            calloutEl.current.style.transform = `translate(-50%, ${-D - 12 - lift(p.level) + up}px)`;
          } else {
            const roomRight = W - (p.x + D / 2 + 10) > 170;
            calloutEl.current.style.left = roomRight ? `${p.x + D / 2 + 10}px` : "auto";
            calloutEl.current.style.right = roomRight ? "auto" : `${W - (p.x - D / 2 - 10)}px`;
            calloutEl.current.style.transform = `translateY(${-D / 2 + 14 - lift(p.level) + up}px)`;
          }
        }
      }

      if (ghostNoteEl.current) {
        ghostNoteEl.current.style.left = `${mid}px`;
        ghostNoteEl.current.style.opacity = String(eased(t, T.ghostNote.start, T.ghostNote.dur));
      }
    },
    [geo, coins, schedule, callout],
  );

  const mid = geo?.mid ?? 0;

  return (
    <div ref={box} className={s.instrument} role="img" aria-label={instrumentLabel(view)}>
      {geo && (
        <>
          {zone && (
            <>
              <div ref={zoneEl} className={s.zone}>
                <span>
                  {zone.label.replace(/ cheaper$/, "")}
                  <br />
                  cheaper
                </span>
                <em>{zone.pct}</em>
              </div>
              <div ref={breakEl}>
                <BreakMark className={s.break} />
              </div>
            </>
          )}
          <div ref={track} className={s.track} />
          <div ref={ticks} className={s.ticks}>
            {geo.ticks.map((k, i) => (
              <i key={i} data-k={k.fromCentre} className={k.major ? s.major : undefined} style={{ left: k.x }} />
            ))}
          </div>
          <div ref={axis} className={s.axis}>
            {geo.axis.map((a) => (
              <span key={a.label} style={{ left: a.x }}>
                {a.label}
              </span>
            ))}
          </div>
          <div ref={needle} className={s.needle} style={{ left: mid }} />
          <div ref={label} className={s.needleLabel} style={{ left: mid }}>
            {reference.label} <span>{reference.price}</span>
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
                {c.kind !== "ghost" && p && (
                  <span ref={refFor(c.id, "pin")} className={`${s.pin} ${s[c.verdict]}`} style={{ left: p.pinX }} />
                )}
              </div>
            );
          })}

          {geo.biggestStack && geo.biggestStack.ids.length >= 3 && (
            <div ref={stackNote} className={s.stackNote}>
              {view.instrument.stackNote(geo.biggestStack.ids.length, geo.biggestStack.ids)}
            </div>
          )}
          {callout && (
            <div ref={calloutEl} className={s.callout}>
              {callout.text}
            </div>
          )}
          {ghostNote && (
            <div ref={ghostNoteEl} className={s.ghostNote}>
              {ghostNote}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function instrumentLabel(view: View): string {
  const { reference, coins } = view.instrument;
  const priced = coins.filter((c) => c.premium !== null);
  const parts = priced.map((c) => `${c.ticker} ${(c.premium ?? 0) >= 0 ? "+" : "−"}${Math.abs(c.premium ?? 0).toFixed(2)}%`);
  return `Each token's price compared with ${reference.label.toLowerCase()} at ${reference.price}: ${parts.join(", ")}.`;
}
