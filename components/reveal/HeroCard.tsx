"use client";

import { useRef } from "react";
import type { View } from "@/lib/present";
import { eased, spring } from "@/lib/reveal/motion";
import { SPRING, T } from "@/lib/reveal/timings";
import { Coin } from "../Coin";
import { ReasonGlyph } from "../icons";
import { Instrument } from "./Instrument";
import { useTrack } from "./Reveal";
import s from "./Hero.module.css";

export function HeroCard({ view }: { view: View }) {
  const { headline, asset, reasons } = view;
  const aurora = useRef<HTMLDivElement>(null);
  const checking = useRef<HTMLDivElement>(null);
  const shimmer = useRef<HTMLSpanElement>(null);
  const verdict = useRef<HTMLDivElement>(null);
  const medal = useRef<HTMLDivElement>(null);
  const reasonEls = useRef<(HTMLLIElement | null)[]>([]);
  const buzzed = useRef(false);

  useTrack(
    (t) => {
      // "Weighing N tokens" shimmers, then lifts away.
      const out = eased(t, T.checkingOut.start, T.checkingOut.dur);
      if (checking.current) {
        checking.current.style.opacity = String(1 - out);
        checking.current.style.transform = `translateY(${-T.checkingOut.liftPx * out}px)`;
      }
      if (shimmer.current) shimmer.current.style.backgroundPosition = `${-(t / T.shimmerMsPerPct) % 200}% 0`;

      // The verdict rises, the aurora blooms, the medal pops.
      const v = spring(t, T.verdict.start, SPRING.SOFT);
      if (verdict.current) {
        verdict.current.style.opacity = String(eased(t, T.verdict.start, T.verdict.fadeDur));
        verdict.current.style.transform = `translateY(${(1 - v) * T.verdict.risePx}px)`;
      }
      if (aurora.current) aurora.current.style.opacity = String(eased(t, T.aurora.start, T.aurora.dur));
      const m = spring(t, T.medal.start, SPRING.MEDAL);
      if (medal.current) {
        medal.current.style.transform = `scale(${m}) rotate(${(1 - m) * T.medal.twistDeg}deg)`;
        medal.current.style.opacity = String(Math.min(1, m * 2));
      }
      // A tiny tap on phones when the medal lands.
      if (t >= T.medal.vibrateAt && t < T.end && !buzzed.current) {
        buzzed.current = true;
        navigator.vibrate?.(8);
      }

      reasonEls.current.forEach((li, i) => {
        if (!li) return;
        const a = eased(t, T.reasons.start + i * T.reasons.stagger, T.reasons.dur);
        li.style.opacity = String(a);
        li.style.transform = `translateY(${(1 - a) * T.reasons.risePx}px)`;
      });
    },
    [reasons.length],
  );

  return (
    <section className={`${s.card} ${s.hero} ${s[headline.verdict]}`} aria-labelledby="verdict-word">
      <div ref={aurora} className={s.aurora} />
      <div className={s.top}>
        <div>
          <div className={s.asset}>
            <Coin size={26} />
            <span>
              <strong>{asset.name}</strong>, {asset.claimLine}
            </span>
          </div>
          <div className={s.slot}>
            <div ref={checking} className={s.checking} aria-hidden="true">
              <span ref={shimmer}>
                Weighing {asset.total} token{asset.total === 1 ? "" : "s"}
              </span>
            </div>
            <div ref={verdict} className={s.verdict}>
              <div className={s.vrow}>
                <h1 id="verdict-word" className={s.word}>
                  {headline.word}
                </h1>
                <div ref={medal} className={`${s.medal} ${s[headline.verdict]}`} aria-hidden="true">
                  <MedalGlyph verdict={headline.verdict} />
                </div>
              </div>
              <p className={s.sub}>{headline.sub}</p>
            </div>
          </div>
        </div>
        <ul className={s.reasons}>
          {reasons.map((r, i) => (
            <li key={i} ref={(el) => void (reasonEls.current[i] = el)}>
              <span className={`${s.ic} ${s[r.tone]}`}>
                <ReasonGlyph tone={r.tone} />
              </span>
              <span>
                <strong>{r.strong}</strong>
                {r.rest}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <Instrument view={view} />
    </section>
  );
}

function MedalGlyph({ verdict }: { verdict: View["headline"]["verdict"] }) {
  if (verdict === "GHOST") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <text x="12" y="17" textAnchor="middle" fontSize="15" fontWeight="700" fill="currentColor">
          ?
        </text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {verdict === "FAIR" && <path d="m5 12.5 4.5 4.5L19 7.5" />}
      {verdict === "RICH" && <path d="M12 19V6M6.5 11.5 12 6l5.5 5.5" />}
      {verdict === "THIN" && <path d="M5 12h14" />}
    </svg>
  );
}

