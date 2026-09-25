import type { CSSProperties, Ref } from "react";
import s from "./Coin.module.css";

export type CoinVariant = "gold" | "ghost" | "rich";

/**
 * <Coin size ticker variant> — the one coin used everywhere: header icon, instrument,
 * list rows, best-route card, empty state. Ghost coins show "?".
 */
export function Coin({
  size,
  ticker,
  variant = "gold",
  className,
  ref,
  style,
}: {
  size: number;
  ticker?: string | null;
  variant?: CoinVariant;
  className?: string;
  ref?: Ref<HTMLSpanElement>;
  style?: CSSProperties;
}) {
  const label = variant === "ghost" ? "?" : (ticker ?? "");
  const len = label.length;
  const cls = [s.coin, variant === "ghost" && s.ghost, variant === "rich" && s.rich, className].filter(Boolean).join(" ");
  return (
    <span ref={ref} className={cls} style={{ "--d": `${size}px`, ...style } as CSSProperties} aria-hidden="true">
      {label && <b className={[s.ticker, len >= 7 ? s.xlong : len >= 5 && s.long].filter(Boolean).join(" ")}>{label}</b>}
    </span>
  );
}
