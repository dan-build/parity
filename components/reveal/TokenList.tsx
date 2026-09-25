"use client";

import { useRef } from "react";
import type { RowView, View } from "@/lib/present";
import { VERDICT_WORD } from "@/lib/present";
import { eased } from "@/lib/reveal/motion";
import { T } from "@/lib/reveal/timings";
import { Coin } from "../Coin";
import { VerdictGlyph } from "../icons";
import { useTrack } from "./Reveal";
import hero from "./Hero.module.css";
import s from "./List.module.css";

const BAR_HEIGHTS = [6, 8, 11, 13, 16];

export function TokenList({ view }: { view: View }) {
  const { title, unitLine, rows } = view.list;
  const rowEls = useRef<(HTMLLIElement | null)[]>([]);

  useTrack(
    (t) => {
      rowEls.current.forEach((el, i) => {
        if (!el) return;
        const a = eased(t, T.rows.start + i * T.rows.stagger, T.rows.dur);
        el.style.opacity = String(a);
        el.style.transform = `translateY(${(1 - a) * T.rows.risePx}px)`;
      });
    },
    [rows.length],
  );

  return (
    <section className={`${hero.card} ${s.list}`} aria-labelledby="list-title">
      <div className={s.head}>
        <h2 id="list-title">{title}</h2>
        <span>{unitLine}</span>
      </div>
      <ul className={s.rows}>
        {rows.map((r, i) => (
          <Row key={r.id} row={r} ref={(el) => void (rowEls.current[i] = el)} />
        ))}
      </ul>
    </section>
  );
}

function Row({ row, ref }: { row: RowView; ref: (el: HTMLLIElement | null) => void }) {
  return (
    <li ref={ref} className={[s.r, row.verdict === "GHOST" && s.isGhost].filter(Boolean).join(" ")}>
      <div className={s.who}>
        <Coin size={40} variant={row.coin} />
        <div className={s.whoText}>
          <strong>{row.ticker}</strong>
          <small>{row.sub}</small>
        </div>
      </div>
      <div className={s.px}>
        <strong>{row.price}</strong>
        {row.priceNote && <small className={row.priceNote.tone === "unit" ? s.unit : undefined}>{row.priceNote.text}</small>}
      </div>
      <span className={`${s.prem} ${s[row.premium.tone]}`}>{row.premium.text}</span>
      <div className={s.meter}>
        <span className={s.bars} aria-hidden="true">
          {BAR_HEIGHTS.map((h, k) => (
            <i key={k} className={k < row.exit.bars ? s.on : undefined} style={{ height: h }} />
          ))}
        </span>
        {row.exit.word} exit
      </div>
      <span className={`${s.badge} ${s[row.verdict]}`}>
        <i>
          <VerdictGlyph verdict={row.verdict} />
        </i>
        {VERDICT_WORD[row.verdict]}
      </span>
    </li>
  );
}
