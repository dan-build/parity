"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { EvidenceView } from "@/lib/present";
import s from "./Evidence.module.css";

/** Floating "● Evidence 7" pill and the drawer it opens. */
export function Evidence({
  rows,
  mode,
  defaultOpen = false,
}: {
  rows: EvidenceView[];
  mode: "fixture" | "live";
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const close = useRef<HTMLButtonElement>(null);
  const pill = useRef<HTMLButtonElement>(null);
  const calls = rows.filter((r) => !r.static).length;
  // Open the most useful response by default: the quotes that carry every token's price.
  const [expanded, setExpanded] = useState<string | null>(
    () => rows.find((r) => r.label.includes("/quotes/latest") && r.excerpt)?.id ?? null,
  );

  useEffect(() => {
    if (!open) return;
    const opener = pill.current;
    close.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      opener?.focus({ preventScroll: true });
    };
  }, [open]);

  return (
    <div className={open ? s.open : undefined}>
      <button ref={pill} className={s.pill} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
        <span className={`${s.live} ${mode === "fixture" ? s.saved : ""}`} aria-hidden="true" />
        Evidence
        <span className={s.n}>{calls}</span>
      </button>
      <div className={s.scrim} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside className={s.drawer} role="dialog" aria-modal="true" aria-label="Evidence" aria-hidden={!open}>
        <button ref={close} className={s.x} onClick={() => setOpen(false)} aria-label="Close">
          ×
        </button>
        <h3>Evidence</h3>
        <p className={s.lede}>
          {mode === "live"
            ? "Every call behind this answer, exactly as CoinMarketCap returned it."
            : "Every call behind this answer. Saved CoinMarketCap responses, replayed without spending credits."}
        </p>
        <ul className={s.calls}>
          {rows.map((r) => {
            const canOpen = r.excerpt !== null && r.excerpt !== undefined;
            const isOpen = expanded === r.id && canOpen;
            const top = (
              <>
                <i aria-hidden="true" />
                <code>{r.label}</code>
                <em>{r.meta}</em>
              </>
            );
            return (
              <li key={r.id} className={`${s.call} ${r.ok ? "" : s.fail}`}>
                {canOpen ? (
                  <button className={s.top} onClick={() => setExpanded(isOpen ? null : r.id)} aria-expanded={isOpen}>
                    {top}
                  </button>
                ) : (
                  <div className={s.top}>{top}</div>
                )}
                {r.note && <p className={s.note}>{r.note}</p>}
                {isOpen && <pre className={s.pre}>{highlight(r.excerpt)}</pre>}
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}

/** Pretty JSON with keys muted and numbers in gold. */
function highlight(value: unknown): ReactNode {
  const json = JSON.stringify(value, null, 2) ?? "";
  const parts: ReactNode[] = [];
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(json))) {
    parts.push(json.slice(last, m.index));
    if (m[1] && m[2]) {
      parts.push(
        <Fragment key={i++}>
          <span className={s.k}>{m[1]}</span>
          {m[2]}
        </Fragment>,
      );
    } else if (m[1]) {
      parts.push(m[1]);
    } else {
      parts.push(
        <span key={i++} className={s.g}>
          {m[3]}
        </span>,
      );
    }
    last = re.lastIndex;
  }
  parts.push(json.slice(last));
  return parts;
}
