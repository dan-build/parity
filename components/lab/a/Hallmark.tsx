"use client";

/** A · Hallmark — the result as an assay certificate. */
import { useMemo, useRef, type CSSProperties } from "react";
import { present, type CheckResponse, type RowView, type View } from "@/lib/present";
import { eased, spring } from "@/lib/reveal/motion";
import { SPRING, T } from "@/lib/reveal/timings";
import { useTrack } from "../../reveal/Reveal";
import { Instrument as LabInstrument, type CoinProps as LabCoinProps } from "../../reveal/Instrument";
import { LabShell } from "../LabShell";
import s from "./Hallmark.module.css";

const GEOMETRY = { coin: { desktop: 44, mobile: 30 }, zone: { desktop: 112, mobile: 66 } };

export function Hallmark({ data, seek }: { data: CheckResponse; seek: number | null }) {
  const view = useMemo(() => present(data), [data]);
  return (
    <div className={s.page}>
      <div className={s.wrap}>
        <header className={s.header}>
          <span className={s.brand}>
            <i className={s.mark} aria-hidden="true" />
            Parity
          </span>
          {data.mood && (
            <span className={s.mood}>
              Fear &amp; greed <b>{Math.round(data.mood.value)}</b> · {data.mood.classification}
            </span>
          )}
        </header>
        <LabShell seek={seek}>
          <Hero view={view} />
          <section className={s.panel} aria-label="Every token on one scale">
            <div className={s.panelHead}>
              <span>Premium against the typical price</span>
              <span>±1%</span>
            </div>
            <LabInstrument
              view={view}
              s={s}
              Coin={FlatCoin}
              line={65}
              mobileZoneLift={34}
              geometry={GEOMETRY}
              ariaNoun={view.asset.noun}
              label={
                <>
                  {view.instrument.reference.label} <b>{view.instrument.reference.price}</b>
                </>
              }
              zone={view.instrument.zone && <span>{view.instrument.zone.label.replace("Looks ", "Looks\n")}</span>}
            />
          </section>
          <Ledger view={view} />
        </LabShell>
      </div>
    </div>
  );
}

function Hero({ view }: { view: View }) {
  const { headline, asset, reasons } = view;
  const checking = useRef<HTMLDivElement>(null);
  const verdict = useRef<HTMLDivElement>(null);
  const stamp = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLLIElement | null)[]>([]);

  useTrack(
    (t) => {
      const out = eased(t, T.checkingOut.start, T.checkingOut.dur);
      if (checking.current) {
        checking.current.style.opacity = String(1 - out);
        checking.current.style.transform = `translateY(${-8 * out}px)`;
      }
      const v = spring(t, T.verdict.start, SPRING.SOFT);
      if (verdict.current) {
        verdict.current.style.opacity = String(eased(t, T.verdict.start, T.verdict.fadeDur));
        verdict.current.style.transform = `translateY(${(1 - v) * 18}px)`;
      }
      // The stamp presses in: from slightly large and faint, down to rest, with its ink spread tightening.
      const m = spring(t, T.medal.start, SPRING.MEDAL);
      if (stamp.current) {
        const press = 1 - Math.min(1, m);
        stamp.current.style.opacity = String(Math.min(1, m * 3));
        stamp.current.style.transform = `rotate(-6deg) scale(${1 + press * 0.35})`;
        stamp.current.style.boxShadow = `0 0 0 ${(press * 10).toFixed(2)}px color-mix(in srgb, var(--v) ${Math.round(press * 14)}%, transparent)`;
      }
      items.current.forEach((li, i) => {
        if (!li) return;
        const a = eased(t, T.reasons.start + i * T.reasons.stagger, T.reasons.dur);
        li.style.opacity = String(a);
        li.style.transform = `translateY(${(1 - a) * 8}px)`;
      });
    },
    [reasons.length],
  );

  return (
    <section className={`${s.hero} ${s[headline.verdict]}`} aria-labelledby="a-verdict">
      <div>
        <div className={s.eyebrow}>
          {asset.name} · {asset.claimLine}
        </div>
        <div className={s.slot}>
          <div ref={checking} className={s.checking} aria-hidden="true">
            Weighing <em>{asset.total}</em> tokens…
          </div>
          <div ref={verdict} className={s.verdict}>
            <div className={s.vrow}>
              <h1 id="a-verdict" className={s.word}>
                {headline.word}
              </h1>
              <div ref={stamp} className={s.stamp} aria-hidden="true">
                <Stamp verdict={headline.verdict} />
              </div>
            </div>
            <p className={s.sub}>{headline.sub}</p>
          </div>
        </div>
      </div>
      <ol className={s.reasons}>
        {reasons.map((r, i) => (
          <li key={i} ref={(el) => void (items.current[i] = el)}>
            <span>
              <strong>{r.strong}</strong>
              {r.rest}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** An assay mark: double ring, lettering around the edge, verdict glyph in the middle. */
function Stamp({ verdict }: { verdict: View["headline"]["verdict"] }) {
  const date = "26 IX 2026";
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor">
      <defs>
        <path id="a-arc" d="M32 32 m-24 0 a24 24 0 1 1 48 0 a24 24 0 1 1 -48 0" />
      </defs>
      <circle cx="32" cy="32" r="30.5" strokeWidth="1.5" />
      <circle cx="32" cy="32" r="19" strokeWidth="1" />
      {/* Circumference of r=24 is ~150.8; textLength makes the lettering meet itself exactly. */}
      <text fontSize="5.6" fill="currentColor" stroke="none" style={{ fontFamily: "var(--mono)" }} textLength="148" lengthAdjust="spacing">
        <textPath href="#a-arc" startOffset="0">
          PARITY · ASSAYED · {date} ·
        </textPath>
      </text>
      <g strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" transform="translate(20 20)">
        {verdict === "FAIR" && <path d="m5 12.5 4.5 4.5L19 7.5" />}
        {verdict === "RICH" && <path d="M12 19V6M6.5 11.5 12 6l5.5 5.5" />}
        {verdict === "THIN" && <path d="M5 12h14" />}
        {verdict === "GHOST" && <circle cx="12" cy="12" r="6" strokeDasharray="2.5 2.5" />}
      </g>
    </svg>
  );
}

function FlatCoin({ size, ticker, variant = "gold", ref, style }: LabCoinProps) {
  const ghost = variant === "ghost";
  const d = size;
  const css: CSSProperties = {
    position: "relative",
    display: "grid",
    placeItems: "center",
    width: d,
    height: d,
    borderRadius: "50%",
    fontFamily: "var(--mono)",
    fontSize: Math.max(7, d * ((ticker?.length ?? 0) >= 5 ? 0.15 : 0.19)),
    fontWeight: 500,
    letterSpacing: "0.02em",
    color: ghost ? "var(--grey)" : "#6B4C12",
    background: ghost ? "transparent" : "radial-gradient(circle at 50% 38%, #F3DFA9 0%, #E3C27A 100%)",
    boxShadow: ghost
      ? "none"
      : `inset 0 0 0 1px #A87A24, inset 0 0 0 ${Math.round(d * 0.1)}px #EAD08F, inset 0 0 0 ${Math.round(d * 0.1) + 1}px rgba(168,122,36,.7)`,
    border: ghost ? "1px dashed var(--grey-2)" : undefined,
    outline: variant === "rich" ? "1px solid var(--rich)" : undefined,
    outlineOffset: 3,
    ...style,
  };
  return (
    <span ref={ref} style={css} aria-hidden="true">
      {ghost ? "?" : ticker}
    </span>
  );
}

function Ledger({ view }: { view: View }) {
  const rows = view.list.rows.slice(0, 3);
  const els = useRef<(HTMLLIElement | null)[]>([]);
  useTrack(
    (t) =>
      els.current.forEach((el, i) => {
        if (!el) return;
        const a = eased(t, T.rows.start + i * T.rows.stagger, T.rows.dur);
        el.style.opacity = String(a);
        el.style.transform = `translateY(${(1 - a) * 8}px)`;
      }),
    [rows.length],
  );
  return (
    <section className={s.ledger} aria-labelledby="a-ledger">
      <div className={s.ledgerHead}>
        <h2 id="a-ledger">{view.list.title}</h2>
        <span>{view.list.unitLine}</span>
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
  return (
    <li ref={ref} className={`${s.row} ${s[r.verdict]}`}>
      <div className={s.who}>
        <div style={{ minWidth: 0 }}>
          <strong>
            {r.ticker}
            <span className={s.inlineTag}>{r.verdict.toLowerCase()}</span>
          </strong>
          <small>{r.sub}</small>
        </div>
      </div>
      <div className={s.price}>
        {r.price}
        {r.priceNote?.tone === "unit" && <small>{r.priceNote.text.replace("Converted from ", "from ")}</small>}
      </div>
      <span className={s.prem}>
        {r.premium.text}
        <i className={s.dot} />
      </span>
      <div className={s.exit}>
        <span className={s.meter} aria-hidden="true">
          {[0, 1, 2, 3, 4].map((k) => (
            <i key={k} className={k < r.exit.bars ? s.on : undefined} />
          ))}
        </span>
        {r.exit.word.toLowerCase()} exit
      </div>
      <span className={s.verdictTag}>{r.verdict.toLowerCase()}</span>
    </li>
  );
}
