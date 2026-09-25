"use client";

import { useRef } from "react";
import type { View } from "@/lib/present";
import { eased, spring } from "@/lib/reveal/motion";
import { SPRING, T } from "@/lib/reveal/timings";
import { Coin } from "../Coin";
import { GapGlyph } from "../icons";
import { useTrack } from "./Reveal";
import hero from "./Hero.module.css";
import s from "./Lower.module.css";

export function Lower({ view }: { view: View }) {
  const route = useRef<HTMLDivElement>(null);

  useTrack((t) => {
    if (!route.current) return;
    route.current.style.opacity = String(eased(t, T.route.start, T.route.fadeDur));
    route.current.style.transform = `translateY(${(1 - spring(t, T.route.start, SPRING.SOFT)) * T.route.risePx}px)`;
  }, []);

  return (
    <>
      <section className={s.lower}>
        <div ref={route} className={s.route}>
          <small>Best way in today</small>
          {view.route ? (
            <>
              <div className={s.rrow}>
                <Coin size={64} ticker={view.route.ticker} />
                <h3>
                  {view.route.ticker} {view.route.by && <span>by {view.route.by}</span>}
                </h3>
              </div>
              <p>{view.route.line}</p>
              <div className={s.stats}>
                {view.route.stats.map((st) => (
                  <div key={st.label}>
                    <strong>{st.value}</strong>
                    {st.label}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className={s.rrow}>
                <Coin size={64} variant="ghost" />
                <h3>None today</h3>
              </div>
              <p>Every token here is a derivative feed, has no price, or doesn&apos;t track {view.asset.noun}.</p>
            </>
          )}
        </div>
        <div className={`${hero.card} ${s.gaps}`}>
          <h3>What the data can&apos;t tell you</h3>
          <ul>
            {view.gaps.map((g) => (
              <li key={g.title}>
                <span className={s.ic}>
                  <GapGlyph icon={g.icon} />
                </span>
                <div>
                  <strong>{g.title}</strong>
                  <small>{g.sub}</small>
                </div>
              </li>
            ))}
          </ul>
          <p>We show the gaps instead of guessing around them.</p>
        </div>
      </section>
      <p className={s.fine}>{view.fine}</p>
    </>
  );
}
