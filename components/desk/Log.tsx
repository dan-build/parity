"use client";

/**
 * The log narrates each real call as the instrument plays, then folds into a toast
 * as the verdict lands. On phones only the current line shows, then the toast.
 */
import { useMemo, useRef } from "react";
import { logLines, logSummary } from "@/lib/log";
import type { CheckResponse } from "@/lib/present";
import { eased, spring } from "@/lib/reveal/motion";
import { SPRING, T } from "@/lib/reveal/timings";
import { VerdictGlyph } from "../icons";
import { useTrack } from "../reveal/Reveal";
import s from "./Log.module.css";

const FOLD = T.checkingOut.start;

export function Log({ data, onEvidence }: { data: CheckResponse; onEvidence?: () => void }) {
  const lines = useMemo(() => logLines(data), [data]);
  const sum = useMemo(() => logSummary(data), [data]);
  const els = useRef<(HTMLLIElement | null)[]>([]);
  const toast = useRef<HTMLDivElement>(null);

  useTrack(
    (t) => {
      const current = lines.reduce((c, l, i) => (l.at <= t ? i : c), -1);
      const fold = eased(t, FOLD, 360);
      els.current.forEach((el, i) => {
        if (!el) return;
        const a = eased(t, lines[i].at, 160);
        // Lines fold down towards the toast as the verdict lands, then stay as quiet history.
        const f = eased(t, FOLD + (lines.length - 1 - i) * 30, 300);
        el.style.opacity = String(a * (1 - 0.3 * f));
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
    <aside className={s.log} aria-label="What we checked">
      <div className={s.head}>
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
        <span className={s.icon} aria-hidden="true">
          <VerdictGlyph verdict={data.verdict} size={12} />
        </span>
        <span>
          <strong>{sum.verdictLine}</strong>
          <small>
            {sum.calls} calls · {sum.credits} cr · {data.mode === "fixture" ? "replayed" : "live"}
          </small>
        </span>
        {onEvidence && (
          <button type="button" onClick={onEvidence} aria-haspopup="dialog">
            Evidence
          </button>
        )}
      </div>
    </aside>
  );
}
