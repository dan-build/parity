"use client";

/** Every token that claims to be the asset: price, premium, exit and verdict. Ghosts last. */
import { useMemo, useRef } from "react";
import type { RowView, View } from "@/lib/present";
import { eased } from "@/lib/reveal/motion";
import { T } from "@/lib/reveal/timings";
import { useTrack } from "../reveal/Reveal";
import { RingCoin } from "./RingCoin";
import s from "./List.module.css";

export function List({ view }: { view: View }) {
  const rows = useMemo(
    () => [...view.list.rows.filter((r) => r.verdict !== "GHOST"), ...view.list.rows.filter((r) => r.verdict === "GHOST")],
    [view.list.rows],
  );
  const els = useRef<(HTMLLIElement | null)[]>([]);
  useTrack(
    (t) =>
      els.current.forEach((el, i) => {
        if (!el) return;
        const a = eased(t, T.rows.start + i * T.rows.stagger, T.rows.dur);
        el.style.opacity = String(a);
        el.style.transform = `translateY(${(1 - a) * 6}px)`;
      }),
    [rows.length],
  );
  return (
    <section className={s.list} aria-labelledby="list-title">
      <div className={s.head}>
        <h2 id="list-title">
          {view.list.title} <b>{view.asset.total}</b>
        </h2>
        <span>{view.list.unitLine.toLowerCase()}</span>
      </div>
      <div className={s.cols} aria-hidden="true">
        <span>token</span>
        <span>price</span>
        <span>{view.instrument.reference.vs.replace(" price", "")}</span>
        <span>exit</span>
        <span>verdict</span>
      </div>
      <ul className={s.rows}>
        {rows.map((r, i) => (
          <Row key={r.id} r={r} ref={(el) => void (els.current[i] = el)} />
        ))}
      </ul>
    </section>
  );
}

function Row({ r, ref }: { r: RowView; ref: (el: HTMLLIElement | null) => void }) {
  const tone = r.premium.tone === "rich" ? s.rich : r.premium.tone === "fair" ? s.fair : "";
  return (
    <li ref={ref} className={`${s.row} ${r.best ? s.best : ""}`} data-verdict={r.verdict}>
      <div className={s.who}>
        <RingCoin size={22} variant={r.coin === "ghost" ? "ghost" : r.verdict === "RICH" ? "rich" : "gold"} />
        <strong>{r.ticker}</strong>
        {r.best && <span className={s.tag}>best way in</span>}
        <small>{r.sub}</small>
      </div>
      <div className={s.price}>
        {r.price}
        {r.priceNote && <small className={r.priceNote.tone === "unit" ? s.unit : undefined}>{r.priceNote.text}</small>}
      </div>
      <span className={`${s.prem} ${tone}`}>{r.premium.text}</span>
      <div className={s.exit}>
        <span className={s.bars} aria-hidden="true">
          {[4, 6, 8, 10, 11].map((h, k) => (
            <i key={k} className={k < r.exit.bars ? s.on : undefined} style={{ height: h }} />
          ))}
        </span>
        <span className={s.sr}>exit: </span>
        {r.exit.word.toLowerCase()}
      </div>
      <span className={s.status}>
        <i />
        {r.verdict.toLowerCase()}
      </span>
    </li>
  );
}
