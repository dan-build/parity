/**
 * An outlined coin with its ticker. Long tickers get a smaller font instead of being
 * cut: two tokens must never look alike because their names were trimmed.
 */
import type { CSSProperties } from "react";
import type { CoinProps } from "../reveal/Instrument";
import s from "./RingCoin.module.css";

/** Smallest ticker font, in px. */
const MIN_FONT = 8;

/** Font size that fits `ticker` inside a coin of `size` px (Geist Mono is ~0.6em per glyph). */
export function tickerFont(size: number, ticker: string): number {
  const fit = (size * 0.74) / (Math.max(1, ticker.length) * 0.6);
  return Math.max(MIN_FONT, Math.min(size * 0.26, fit));
}

export function RingCoin({ size, ticker, variant = "gold", title, tipAlign = "center", ref, style }: CoinProps) {
  const ghost = variant === "ghost";
  const rich = variant === "rich";
  const colour = ghost ? "var(--ghost)" : rich ? "var(--rich)" : "var(--gold)";
  const inner = Math.round(size * 0.12);
  const label = ghost ? "?" : (ticker ?? "");
  const css: CSSProperties = {
    display: "grid",
    placeItems: "center",
    flex: "none",
    width: size,
    height: size,
    borderRadius: "50%",
    fontFamily: "var(--mono)",
    fontSize: tickerFont(size, label),
    letterSpacing: label.length >= 5 ? "-0.04em" : undefined,
    whiteSpace: "nowrap",
    color: colour,
    background: ghost ? "transparent" : rich ? "rgba(255,107,122,.10)" : "rgba(227,176,75,.10)",
    boxShadow: ghost
      ? "none"
      : `inset 0 0 0 1.5px ${colour}, inset 0 0 0 ${inner}px rgba(15,15,16,.35), inset 0 0 0 ${inner + 1}px color-mix(in srgb, ${colour} 40%, transparent)`,
    border: ghost ? "1.5px dashed var(--ghost)" : undefined,
    ...style,
  };
  return (
    // With a title, the coin shows its full name on hover, or on tap (tabIndex -1 lets a tap focus it).
    <span
      ref={ref}
      style={css}
      aria-hidden="true"
      className={title ? s.tip : undefined}
      data-tip={title}
      data-align={title ? tipAlign : undefined}
      tabIndex={title ? -1 : undefined}
    >
      {label}
    </span>
  );
}
