"use client";

/**
 * Everything the window shows when there's no result: the empty desk, the loading
 * skeleton (same grid as a result, so nothing jumps), not found, and errors.
 */
import { labelFor } from "@/lib/chips";
import { RingCoin } from "./RingCoin";
import s from "./States.module.css";

/** First visit: the question, and a quiet line of coins waiting to be weighed. */
const ANSWERS = [
  {
    v: "FAIR",
    word: "Fair",
    line: "Priced like the others, with a market to sell into.",
  },
  {
    v: "RICH",
    word: "Rich",
    line: "Even the best token costs more than the typical price.",
  },
  {
    v: "THIN",
    word: "Thin",
    line: "The price is fine, but little trading to sell into later.",
  },
  {
    v: "GHOST",
    word: "Ghost",
    line: "Nothing you can really hold: no price, or not a real token.",
  },
] as const;

export function Empty() {
  return (
    <div className={s.emptyGrid}>
      <div className={s.empty}>
        <div className={s.eyebrow}>tokenised real-world assets</div>
        <h1 className={s.title}>Is your tokenised gold actually gold?</h1>
        <p className={s.lede}>
          Pick an asset above. We weigh every token that claims to be it:
          whether it&apos;s fairly priced, what unit it&apos;s quoted in, and
          whether you could sell it later.
        </p>
        <div className={s.idle} aria-hidden="true">
          <span className={s.line} />
          <span className={s.coins}>
            <RingCoin size={42} ticker="PAXG" />
            <RingCoin size={42} ticker="XAUt" />
            <RingCoin size={42} ticker="CGO" />
            <RingCoin size={42} variant="ghost" />
          </span>
        </div>
        <ol className={s.steps}>
          <li>
            <b>01</b> find the asset, not just the symbol
          </li>
          <li>
            <b>02</b> price every token on one scale
          </li>
          <li>
            <b>03</b> check you could sell it later
          </li>
        </ol>
      </div>
      <section className={s.answers} aria-labelledby="answers-title">
        <h2 id="answers-title">four possible answers</h2>
        <ul>
          {ANSWERS.map((a) => (
            <li key={a.v} data-verdict={a.v}>
              <strong>{a.word}</strong>
              <span>{a.line}</span>
            </li>
          ))}
        </ul>
        <p>Every answer comes with the calls behind it, one click away.</p>
      </section>
    </div>
  );
}

/** While /api/check runs: the result's layout, with the work narrated in the log slot. */
export function Loading({ q, grid }: { q: string; grid: string }) {
  return (
    <div className={grid} aria-busy="true" aria-live="polite">
      <section className={s.skVerdict}>
        <div className={s.eyebrow}>{labelFor(q)}</div>
        <p className={s.checking}>
          resolving {labelFor(q)}
          <b aria-hidden="true" />
        </p>
      </section>
      <aside className={s.skLog} aria-hidden="true">
        <span className={s.skHead}>log</span>
        <span className={s.skLine}>
          <time>0.00s</time> GET rwa/map <em>…</em>
        </span>
      </aside>
      <div className={s.skStage} aria-hidden="true">
        <span />
      </div>
      {/* Same order as a result on phones: verdict, log, instrument, tiles, list. */}
      <div className={s.skTiles} aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} />
        ))}
      </div>
      <div className={s.skList} aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} />
        ))}
      </div>
    </div>
  );
}

export function Message({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={s.message} role="status">
      <div className={s.eyebrow}>{eyebrow}</div>
      <h1 className={s.title}>{title}</h1>
      <p className={s.lede}>{body}</p>
      {children}
    </div>
  );
}

export function Retry({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={s.suggest}>
      <button type="button" className={s.primary} onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export function Suggestions({
  items,
  onPick,
}: {
  items: { symbol: string; name: string }[];
  onPick: (q: string) => void;
}) {
  return (
    <div className={s.suggest}>
      {items.map((x) => (
        <button key={x.symbol} type="button" onClick={() => onPick(x.symbol)}>
          {x.name} <span>{x.symbol}</span>
        </button>
      ))}
    </div>
  );
}
