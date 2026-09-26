"use client";

/**
 * The hero, as three grid items so phones can put the instrument right under the
 * verdict: Verdict (word, chip, sub), Tiles (four facts) and Reasons.
 */
import { useRef } from "react";
import type { View } from "@/lib/present";
import { eased, spring } from "@/lib/reveal/motion";
import { SPRING, T } from "@/lib/reveal/timings";
import { useTrack } from "../reveal/Reveal";
import s from "./Hero.module.css";

export function Verdict({ view }: { view: View }) {
  const { headline, asset } = view;
  const checking = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLElement>(null);
  const verdict = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLSpanElement>(null);

  useTrack((t) => {
    const out = eased(t, T.checkingOut.start, T.checkingOut.dur);
    if (checking.current) checking.current.style.opacity = String(1 - out);
    if (cursor.current) cursor.current.style.opacity = Math.floor(t / 480) % 2 ? "0" : "1";
    const v = spring(t, T.verdict.start, SPRING.SOFT);
    if (verdict.current) {
      verdict.current.style.opacity = String(eased(t, T.verdict.start, T.verdict.fadeDur));
      verdict.current.style.transform = `translateY(${(1 - v) * 16}px)`;
    }
    const m = spring(t, T.medal.start, SPRING.SNAP);
    if (chip.current) {
      chip.current.style.opacity = String(Math.min(1, m * 2));
      chip.current.style.transform = `translateY(${(1 - m) * 6}px)`;
    }
  }, []);

  return (
    <section className={s.verdictCell} aria-labelledby="verdict">
      <div className={s.eyebrow}>
        {asset.name} · {asset.claimLine}
      </div>
      <div className={s.slot}>
        <div ref={checking} className={s.checking} aria-hidden="true">
          weighing {asset.total} tokens
          <b ref={cursor} />
        </div>
        <div ref={verdict} className={s.verdict}>
          <div className={s.vrow}>
            <h1 id="verdict" className={s.word}>
              {headline.word}
            </h1>
            <span ref={chip} className={s.chip}>
              <i />
              {view.route ? `best way in · ${view.route.display}` : "nothing to hold"}
            </span>
          </div>
          <p className={s.sub}>{headline.sub}</p>
        </div>
      </div>
    </section>
  );
}

export function Tiles({ view }: { view: View }) {
  const tiles = useRef<(HTMLDivElement | null)[]>([]);
  useTrack(
    (t) =>
      tiles.current.forEach((el, i) => {
        if (!el) return;
        const a = eased(t, T.reasons.start + i * T.reasons.stagger, T.reasons.dur);
        el.style.opacity = String(a);
        el.style.transform = `translateY(${(1 - a) * 8}px)`;
      }),
    [view.summary.length],
  );
  return (
    <div className={s.tilesCell}>
      <dl className={s.tiles} aria-label="At a glance">
        {view.summary.map((st, i) => (
          <div key={st.label} ref={(el) => void (tiles.current[i] = el)} className={s.tile}>
            <dt>{st.label}</dt>
            <dd>
              <strong>{st.value}</strong>
              <small>{st.note}</small>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function Reasons({ view }: { view: View }) {
  const { reasons, summary } = view;
  const items = useRef<(HTMLLIElement | null)[]>([]);
  useTrack(
    (t) =>
      items.current.forEach((li, i) => {
        if (!li) return;
        // After the tiles.
        const a = eased(t, T.reasons.start + (summary.length + i) * T.reasons.stagger, T.reasons.dur);
        li.style.opacity = String(a);
        li.style.transform = `translateX(${(1 - a) * -6}px)`;
      }),
    [reasons.length, summary.length],
  );
  return (
    <ul className={s.reasons} aria-label="Why">
      {reasons.map((r, i) => (
        <li key={i} ref={(el) => void (items.current[i] = el)} className={s[r.tone]}>
          <span>
            <strong>{r.strong}</strong>
            {r.rest}
          </span>
        </li>
      ))}
    </ul>
  );
}
