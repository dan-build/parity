"use client";

/** B · Desk — a dark trading tool; the log narrates the work, then folds into a toast. */
import { useMemo, useRef, type CSSProperties } from "react";
import { logLines, logSummary } from "@/lib/log";
import { present, type CheckResponse, type RowView, type View } from "@/lib/present";
import { eased, spring } from "@/lib/reveal/motion";
import { SPRING, T } from "@/lib/reveal/timings";
import { useTrack } from "../../reveal/Reveal";
import { LabInstrument, type LabCoinProps } from "../LabInstrument";
import { LabShell } from "../LabShell";
import s from "./Desk.module.css";

const GEOMETRY = { coin: { desktop: 42, mobile: 30 }, zone: { desktop: 104, mobile: 64 } };

export function Desk({ data, seek }: { data: CheckResponse; seek: number | null }) {
  const view = useMemo(() => present(data), [data]);
  return (
    <div className={s.page}>
      <div className={s.wrap}>
        <header className={s.header}>
          <span className={s.brand}>
            <i aria-hidden="true" />
            Parity
          </span>
          <span className={s.crumb}>
            rwa / <b>{view.asset.symbol.toLowerCase()}</b>
          </span>
          {data.mood && (
            <span className={s.mood}>
              <i aria-hidden="true" />
              F&amp;G <b>{Math.round(data.mood.value)}</b> {data.mood.classification.toLowerCase()}
            </span>
          )}
        </header>
        <LabShell seek={seek} dark>
          <div className={s.window}>
            <div className={s.titlebar} aria-hidden="true">
              <i />
              <i />
              <i />
              <span>parity — check {view.asset.symbol}</span>
              <em>{data.mode === "fixture" ? "saved" : "live"}</em>
            </div>
            <div className={s.grid}>
              <Hero view={view} />
              <Log data={data} verdict={view.headline.verdict} />
              <section className={s.stage} aria-label="Every token on one scale">
                <div className={s.stageHead}>
                  <span>vs typical price</span>
                  <span>±1%</span>
                </div>
                <LabInstrument
                  view={view}
                  s={s}
                  Coin={RingCoin}
                  line={63}
                  mobileZoneLift={32}
                  geometry={GEOMETRY}
                  ariaNoun={view.asset.noun}
                  label={
                    <>
                      {view.instrument.reference.label.toLowerCase()} <b>{view.instrument.reference.price}</b>
                    </>
                  }
                  zone={view.instrument.zone && <span>{`looks\n${view.instrument.zone.pct}`}</span>}
                />
              </section>
              <List view={view} />
            </div>
          </div>
        </LabShell>
      </div>
    </div>
  );
}

function Hero({ view }: { view: View }) {
  const { headline, asset, reasons } = view;
  const checking = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLElement>(null);
  const verdict = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLSpanElement>(null);
  const items = useRef<(HTMLLIElement | null)[]>([]);

  useTrack(
    (t) => {
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
      items.current.forEach((li, i) => {
        if (!li) return;
        const a = eased(t, T.reasons.start + i * T.reasons.stagger, T.reasons.dur);
        li.style.opacity = String(a);
        li.style.transform = `translateX(${(1 - a) * -6}px)`;
      });
    },
    [reasons.length],
  );

  return (
    <section className={`${s.hero} ${s[headline.verdict]}`} aria-labelledby="b-verdict">
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
            <h1 id="b-verdict" className={s.word}>
              {headline.word}
            </h1>
            <span ref={chip} className={s.chip}>
              <i />
              {view.route ? `${view.route.ticker} is the way in` : "nothing to hold"}
            </span>
          </div>
          <p className={s.sub}>{headline.sub}</p>
        </div>
      </div>
      <ul className={s.reasons}>
        {reasons.map((r, i) => (
          <li key={i} ref={(el) => void (items.current[i] = el)}>
            <span>
              <strong>{r.strong}</strong>
              {r.rest}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Log({ data, verdict }: { data: CheckResponse; verdict: View["headline"]["verdict"] }) {
  const lines = useMemo(() => logLines(data), [data]);
  const sum = useMemo(() => logSummary(data), [data]);
  const els = useRef<(HTMLLIElement | null)[]>([]);
  const toast = useRef<HTMLDivElement>(null);
  const FOLD = T.checkingOut.start;

  useTrack(
    (t) => {
      const current = lines.reduce((c, l, i) => (l.at <= t ? i : c), -1);
      const fold = eased(t, FOLD, 360);
      els.current.forEach((el, i) => {
        if (!el) return;
        const a = eased(t, lines[i].at, 160);
        // Lines fold down into the toast as the verdict lands.
        const f = eased(t, FOLD + (lines.length - 1 - i) * 30, 300);
        // After the fold the lines stay as quiet history above the toast.
        el.style.opacity = String(a * (1 - 0.6 * f));
        el.style.transform = `translateY(${f * 4}px)`;
        el.classList.toggle(s.current, i === current && fold < 1);
      });
      const k = spring(t, FOLD + 120, SPRING.SNAP);
      if (toast.current) {
        toast.current.style.opacity = String(Math.min(1, k * 2));
        toast.current.style.transform = `translateY(${(1 - k) * 10}px) scale(${0.97 + 0.03 * Math.min(1, k)})`;
      }
    },
    [lines],
  );

  return (
    <aside className={`${s.log} ${s[verdict]}`} aria-label="What we checked">
      <div className={s.logHead}>
        <span>log</span>
        <span>
          {sum.calls} calls · {sum.credits} cr
        </span>
      </div>
      <ol className={s.lines}>
        {lines.map((l, i) => (
          <li key={i} ref={(el) => void (els.current[i] = el)} className={`${s.line} ${s[l.tone]}`}>
            <time>{(l.at / 1000).toFixed(2)}s</time>
            <span>
              <b>{l.verb}</b>
              {l.text}
              <em>{l.meta}</em>
            </span>
          </li>
        ))}
      </ol>
      <div ref={toast} className={s.toast} role="status">
        <span className={s.toastIcon} aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
            {verdict === "FAIR" && <path d="m5 12.5 4.5 4.5L19 7.5" />}
            {verdict === "RICH" && <path d="M12 19V6M6.5 11.5 12 6l5.5 5.5" />}
            {verdict === "THIN" && <path d="M5 12h14" />}
            {verdict === "GHOST" && <circle cx="12" cy="12" r="6" strokeDasharray="3 3" />}
          </svg>
        </span>
        <span>
          <strong>{sum.verdictLine}</strong>
          <small>
            {sum.calls} calls · {sum.credits} cr · {data.mode === "fixture" ? "replayed" : "live"}
          </small>
        </span>
        <button type="button">Evidence</button>
      </div>
    </aside>
  );
}

function RingCoin({ size, ticker, variant = "gold", ref, style }: LabCoinProps) {
  const ghost = variant === "ghost";
  const rich = variant === "rich";
  const colour = ghost ? "var(--ghost)" : rich ? "var(--rich)" : "var(--gold)";
  const css: CSSProperties = {
    display: "grid",
    placeItems: "center",
    width: size,
    height: size,
    borderRadius: "50%",
    fontFamily: "var(--mono)",
    fontSize: Math.max(7, size * ((ticker?.length ?? 0) >= 5 ? 0.16 : 0.2)),
    color: colour,
    background: ghost ? "transparent" : rich ? "rgba(255,107,122,.10)" : "rgba(227,176,75,.10)",
    boxShadow: ghost ? "none" : `inset 0 0 0 1.5px ${colour}, inset 0 0 0 ${Math.round(size * 0.12)}px rgba(15,15,16,.35), inset 0 0 0 ${Math.round(size * 0.12) + 1}px color-mix(in srgb, ${colour} 40%, transparent)`,
    border: ghost ? "1.5px dashed var(--ghost)" : undefined,
    ...style,
  };
  return (
    <span ref={ref} style={css} aria-hidden="true">
      {ghost ? "?" : ticker}
    </span>
  );
}

function List({ view }: { view: View }) {
  const rows = view.list.rows.slice(0, 3);
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
    <section className={s.list} aria-labelledby="b-list">
      <div className={s.listHead}>
        <span id="b-list">
          tokens <b>{view.asset.total}</b>
        </span>
        <span>{view.list.unitLine.toLowerCase()}</span>
      </div>
      <div className={s.cols} aria-hidden="true">
        <span>token</span>
        <span>price</span>
        <span>vs typical</span>
        <span>exit</span>
        <span style={{ textAlign: "right" }}>verdict</span>
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
  const up = r.premium.text.startsWith("+");
  return (
    <li ref={ref} className={`${s.row} ${s[r.verdict]}`}>
      <div className={s.who}>
        <RingCoin size={22} variant={r.coin} />
        <strong>{r.ticker}</strong>
        <small>{r.sub}</small>
      </div>
      <div className={s.price}>
        {r.price}
        {r.priceNote?.tone === "unit" && <small>{r.priceNote.text.replace("Converted from ", "from ")}</small>}
      </div>
      <span className={`${s.prem} ${r.premium.text === "—" ? "" : up ? s.up : s.down}`}>{r.premium.text}</span>
      <div className={s.exit}>
        <span className={s.bars} aria-hidden="true">
          {[4, 6, 8, 10, 11].map((h, k) => (
            <i key={k} className={k < r.exit.bars ? s.on : undefined} style={{ height: h }} />
          ))}
        </span>
        {r.exit.word.toLowerCase()}
      </div>
      <span className={s.status}>
        <i />
        {r.verdict.toLowerCase()}
      </span>
    </li>
  );
}
