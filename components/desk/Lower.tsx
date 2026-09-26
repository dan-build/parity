"use client";

/** Under the list: the best way in (or why there isn't one), and what the data can't tell you. */
import { useRef } from "react";
import type { View } from "@/lib/present";
import { eased, spring } from "@/lib/reveal/motion";
import { SPRING, T } from "@/lib/reveal/timings";
import { GapGlyph } from "../icons";
import { useTrack } from "../reveal/Reveal";
import { RingCoin } from "./RingCoin";
import s from "./Lower.module.css";

export function Lower({ view }: { view: View }) {
  const cards = useRef<(HTMLElement | null)[]>([]);
  useTrack(
    (t) =>
      cards.current.forEach((el, i) => {
        if (!el) return;
        const start = T.route.start + i * 120;
        el.style.opacity = String(eased(t, start, T.route.fadeDur));
        el.style.transform = `translateY(${(1 - spring(t, start, SPRING.SOFT)) * T.route.risePx}px)`;
      }),
    [],
  );

  return (
    <div className={s.lower}>
      <section ref={(el) => void (cards.current[0] = el)} className={s.route} aria-labelledby="route-title">
        <h2 className={s.label}>best way in today</h2>
        <Route view={view} />
      </section>
      <section ref={(el) => void (cards.current[1] = el)} className={s.gaps} aria-labelledby="gaps-title">
        <h2 id="gaps-title" className={s.label}>
          what the data can&apos;t tell you
        </h2>
        <ul>
          {view.gaps.map((g) => (
            <li key={g.title}>
              <span className={s.ic} aria-hidden="true">
                <GapGlyph icon={g.icon} />
              </span>
              <div>
                <strong>{g.title}</strong>
                <small>{g.sub}</small>
              </div>
            </li>
          ))}
        </ul>
        <p className={s.coda}>We show the gaps instead of guessing around them.</p>
      </section>
    </div>
  );
}

function Route({ view }: { view: View }) {
  const { route, asset } = view;
  if (route) {
    return (
      <>
        <div className={s.rrow}>
          <RingCoin size={52} ticker={route.ticker} />
          <h3 id="route-title">
            {route.display}
            {route.by && <span>by {route.by}</span>}
          </h3>
        </div>
        <p>{route.line}</p>
        <dl className={s.stats}>
          {route.stats.map((st) => (
            <div key={st.label}>
              <dt>{st.label}</dt>
              <dd>{st.value}</dd>
            </div>
          ))}
        </dl>
        {route.where.length > 0 && (
          <dl className={s.where}>
            {route.where.map((w) => (
              <div key={w.label}>
                <dt>{w.label}</dt>
                <dd>{w.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </>
    );
  }
  return (
    <>
      <div className={s.rrow}>
        <RingCoin size={52} variant="ghost" />
        <h3 id="route-title">{view.noEasyExit ? "No easy way out" : "None today"}</h3>
      </div>
      <p>
        {view.noEasyExit
          ? `None of the ${asset.total} ${asset.noun} tokens traded in the last day, so none of them is easy to sell. Whichever you pick, getting out later could be hard.`
          : `Every token here is a derivative feed, has no price, or doesn't track ${asset.noun}.`}
      </p>
      {view.noEasyExit && (
        <dl className={s.stats}>
          <div>
            <dt>traded in the last day</dt>
            <dd>{view.summary.find((t) => t.label === "Traded, 24h")?.value ?? "$0"}</dd>
          </div>
          <div>
            <dt>tokens you could hold</dt>
            <dd>{view.list.rows.filter((r) => r.verdict !== "GHOST").length}</dd>
          </div>
          <div>
            <dt>exit</dt>
            <dd>None</dd>
          </div>
        </dl>
      )}
    </>
  );
}
