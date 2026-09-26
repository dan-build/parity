"use client";

/**
 * The Evidence drawer: every call behind the answer, with the endpoint, params, cost
 * and a trimmed excerpt of what CoinMarketCap returned. A side sheet on desktop, a
 * bottom sheet on phones. Opened from the toast, the titlebar, or ?drawer.
 */
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { dayLabel, type EvidenceView } from "@/lib/present";
import s from "./Evidence.module.css";

export function Evidence({
  rows,
  mode,
  generatedAt,
  open,
  onClose,
}: {
  rows: EvidenceView[];
  mode: "fixture" | "live";
  generatedAt: string;
  open: boolean;
  onClose: () => void;
}) {
  const close = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLElement>(null);
  const calls = rows.filter((r) => !r.static).length;
  // Open the most useful response first: the quotes that carry every token's price.
  const [expanded, setExpanded] = useState<string | null>(
    () => rows.find((r) => r.label.includes("/quotes/latest") && r.excerpt)?.id ?? null,
  );

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    close.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // Keep Tab inside the sheet while it's open.
      if (e.key === "Tab" && sheet.current) {
        const f = sheet.current.querySelectorAll<HTMLElement>("button");
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      opener?.focus({ preventScroll: true });
    };
  }, [open, onClose]);

  return (
    <div className={`${s.root} ${open ? s.open : ""}`} inert={!open}>
      <div className={s.scrim} onClick={onClose} aria-hidden="true" />
      <aside ref={sheet} className={s.sheet} role="dialog" aria-modal="true" aria-labelledby="evidence-title">
        <header className={s.head}>
          <div>
            <h2 id="evidence-title">Evidence</h2>
            <p>
              {calls} calls ·{" "}
              {mode === "live"
                ? `live from CoinMarketCap, ${stamp(generatedAt)}`
                : "saved CoinMarketCap responses, replayed without spending credits"}
            </p>
          </div>
          <button ref={close} className={s.x} onClick={onClose} aria-label="Close evidence">
            ×
          </button>
        </header>
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
                {r.at && <time className={s.at} dateTime={r.at}>{stamp(r.at)}</time>}
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

/** 25 Sep 2026, 14:02:11 UTC: when CoinMarketCap answered (for saved responses, when they were recorded). */
const stamp = (iso: string) => `${dayLabel(iso)}, ${new Date(iso).toISOString().slice(11, 19)} UTC`;

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
