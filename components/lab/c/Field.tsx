"use client";

/**
 * C · Field — a plain white product card on a grain field. While coins drop, a short
 * log narrates each CMC call; it collapses as the verdict lands and the field develops
 * into the verdict's colour from the top-left corner.
 */
import { useMemo, useRef } from "react";
import { logLines } from "@/lib/log";
import { moneyShort, pct, present, type CheckResponse, type RowView, type View } from "@/lib/present";
import { eased, spring } from "@/lib/reveal/motion";
import { SPRING, T } from "@/lib/reveal/timings";
import type { Verdict } from "@/lib/verdict";
import { Coin } from "../../Coin";
import { useTrack } from "../../reveal/Reveal";
import { LabInstrument } from "../LabInstrument";
import { LabShell } from "../LabShell";
import s from "./Field.module.css";

const GEOMETRY = { coin: { desktop: 46, mobile: 32 }, zone: { desktop: 104, mobile: 64 } };
const DEVELOP = { start: T.verdict.start, dur: 900 };

export function Field({ data, seek }: { data: CheckResponse; seek: number | null }) {
  const view = useMemo(() => present(data), [data]);
  return (
    <div className={s.page}>
      <LabShell seek={seek}>
        <Backdrop verdict={view.headline.verdict} />
        <div className={s.wrap}>
          <header className={s.header}>
            <span className={s.brand}>
              <i aria-hidden="true" />
              parity
            </span>
            {data.mood && (
              <span className={s.mood}>
                Crypto mood <b>{data.mood.classification} {Math.round(data.mood.value)}</b>
              </span>
            )}
          </header>
          <main className={s.card}>
            <div className={s.bar}>
              <Coin size={18} />
              <span>
                <strong>{view.asset.name}</strong> · {view.asset.claimLine}
              </span>
              <Counts view={view} />
            </div>
            <Hero view={view} data={data} />
            <section className={s.stage} aria-label="Every token on one scale">
              <div className={s.stageHead}>
                <span>Premium against the typical price</span>
                <span className={s.seg} aria-hidden="true">
                  <span className={s.on}>±1%</span>
                  <span>±5%</span>
                </span>
              </div>
              <LabInstrument
                view={view}
                s={s}
                Coin={Coin}
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
            <List view={view} />
          </main>
        </div>
      </LabShell>
    </div>
  );
}

/** Neutral grain field, with the verdict-coloured field developing over it from the top-left. */
function Backdrop({ verdict }: { verdict: Verdict }) {
  const develop = useRef<HTMLDivElement>(null);
  useTrack((t) => {
    const el = develop.current;
    if (!el) return;
    const diag = Math.hypot(window.innerWidth, document.documentElement.scrollHeight);
    const p = eased(t, DEVELOP.start, DEVELOP.dur);
    el.style.setProperty("--r", `${-420 + p * (diag + 420)}px`);
  }, []);
  return (
    <>
      <div className={s.field} aria-hidden="true" />
      <div ref={develop} className={`${s.develop} ${s[verdict]}`} aria-hidden="true" />
      <div className={s.grain} aria-hidden="true" />
    </>
  );
}

function Counts({ view }: { view: View }) {
  const counts = (["FAIR", "RICH", "THIN", "GHOST"] as const)
    .map((v) => ({ v, n: view.list.rows.filter((r) => r.verdict === v).length }))
    .filter((c) => c.n > 0);
  return (
    <span className={s.pills}>
      {counts.map((c) => (
        <span key={c.v} className={`${s.pill} ${s[c.v]}`}>
          <i />
          {c.v[0] + c.v.slice(1).toLowerCase()} <em>{c.n}</em>
        </span>
      ))}
    </span>
  );
}

function Hero({ view, data }: { view: View; data: CheckResponse }) {
  const { headline } = view;
  const lines = useMemo(() => logLines(data).slice(0, 6), [data]);
  const logBox = useRef<HTMLDivElement>(null);
  const spinner = useRef<HTMLSpanElement>(null);
  const lineEls = useRef<(HTMLLIElement | null)[]>([]);
  const verdict = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLSpanElement>(null);
  const tiles = useRef<(HTMLDivElement | null)[]>([]);
  const COLLAPSE = T.checkingOut.start;

  useTrack(
    (t) => {
      lineEls.current.forEach((el, i) => {
        if (!el) return;
        const inA = eased(t, lines[i].at, 180);
        // Collapse upward, last line first, as the verdict arrives.
        const out = eased(t, COLLAPSE + (lines.length - 1 - i) * 26, 220);
        el.style.opacity = String(inA * (1 - out));
        el.style.transform = `translateY(${(1 - inA) * 6 - out * 10}px)`;
      });
      if (logBox.current) logBox.current.style.opacity = String(1 - eased(t, COLLAPSE + 160, 200));
      if (spinner.current) spinner.current.style.opacity = String(0.35 + 0.65 * Math.abs(Math.sin(t / 260)));

      const v = spring(t, T.verdict.start, SPRING.SOFT);
      if (verdict.current) {
        verdict.current.style.opacity = String(eased(t, T.verdict.start, T.verdict.fadeDur));
        verdict.current.style.transform = `translateY(${(1 - v) * 20}px)`;
      }
      const m = spring(t, T.medal.start, SPRING.MEDAL);
      if (status.current) {
        status.current.style.opacity = String(Math.min(1, m * 2));
        status.current.style.transform = `scale(${0.6 + 0.4 * m})`;
      }
      tiles.current.forEach((el, i) => {
        if (!el) return;
        const a = eased(t, T.reasons.start + i * T.reasons.stagger, T.reasons.dur);
        el.style.opacity = String(a);
        el.style.transform = `translateY(${(1 - a) * 8}px)`;
      });
    },
    [lines],
  );

  const live = data.wrappers.filter((w) => w.verdict !== "GHOST" && w.premium_pct !== null);
  const spread = live.length > 1 ? Math.max(...live.map((w) => w.premium_pct as number)) - Math.min(...live.map((w) => w.premium_pct as number)) : 0;
  const best = data.wrappers.find((w) => w.crypto_id === data.headline_crypto_id);
  const ghosts = data.wrappers.length - data.wrappers.filter((w) => w.verdict !== "GHOST").length;

  const stats = [
    { label: "Typical price", value: view.instrument.reference.price, note: view.asset.noun === "gold" || view.asset.noun === "silver" ? "/oz" : "/share" },
    { label: "Spread", value: `${spread.toFixed(2)}%`, note: `across ${live.length}` },
    { label: "Best way in", value: best?.display ?? "None", note: best ? `${pct(best.premium_pct ?? 0)} · ${moneyShort(best.volume_24h ?? 0)}/day` : undefined },
    { label: "Tokens checked", value: String(data.wrappers.length), note: ghosts ? `${ghosts} ghost${ghosts > 1 ? "s" : ""}` : "no ghosts" },
  ];

  return (
    <section className={`${s.hero} ${s[headline.verdict]}`} aria-labelledby="c-verdict">
      <div className={s.slot}>
        <div ref={logBox} className={s.logBox} aria-hidden="true">
          <div className={s.logHead}>
            <span ref={spinner} className={s.spinner} />
            Weighing {view.asset.total} tokens
          </div>
          <ol className={s.lines}>
            {lines.map((l, i) => (
              <li key={i} ref={(el) => void (lineEls.current[i] = el)} className={`${s.line} ${s[l.tone]}`}>
                <b>{l.verb}</b>
                <span>
                  {l.text}
                  <em>{l.meta}</em>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div ref={verdict} className={s.verdict}>
          <div className={s.vrow}>
            <h1 id="c-verdict" className={s.word}>
              {headline.word}
            </h1>
            <span ref={status} className={s.status}>
              {best ? `Best: ${best.display}` : "Nothing to hold"}
            </span>
          </div>
          <p className={s.sub}>{headline.sub}</p>
        </div>
      </div>
      <div className={s.tiles}>
        {stats.map((st, i) => (
          <div key={st.label} ref={(el) => void (tiles.current[i] = el)} className={s.tile}>
            <span>{st.label}</span>
            <strong>
              {st.value}
              {st.note && <small>{st.note}</small>}
            </strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function List({ view }: { view: View }) {
  const rows = view.list.rows.slice(0, 3);
  const els = useRef<(HTMLDivElement | null)[]>([]);
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
    <section className={s.list} aria-label={view.list.title}>
      {rows.map((r, i) => (
        <Row key={r.id} r={r} ref={(el) => void (els.current[i] = el)} />
      ))}
    </section>
  );
}

function Row({ r, ref }: { r: RowView; ref: (el: HTMLDivElement | null) => void }) {
  const tone = r.premium.tone === "rich" ? "RICH" : r.premium.tone === "ghost" ? "GHOST" : "FAIR";
  return (
    <div ref={ref} className={s.row}>
      <div className={s.who}>
        <Coin size={32} variant={r.coin} />
        <div style={{ minWidth: 0 }}>
          <strong>{r.ticker}</strong>
          <small>{r.sub}</small>
        </div>
      </div>
      <div className={s.price}>
        {r.price}
        {r.priceNote?.tone === "unit" && <small>{r.priceNote.text}</small>}
      </div>
      <span className={`${s.prem} ${s[tone]}`}>{r.premium.text}</span>
      <span className={s.exit}>
        <span className={s.sig} aria-hidden="true">
          {[3, 5, 7, 8.5, 10].map((h, k) => (
            <i key={k} className={k < r.exit.bars ? s.on : undefined} style={{ height: h }} />
          ))}
        </span>
        {r.exit.word}
      </span>
      <span className={`${s.rowStatus} ${s[r.verdict]}`}>{r.verdict[0] + r.verdict.slice(1).toLowerCase()}</span>
    </div>
  );
}
