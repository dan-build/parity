import Link from "next/link";
import type { Mood } from "@/lib/present";
import s from "./Chrome.module.css";

/** Two stacked gold ingots + wordmark. Right: crypto mood (Fear & Greed). */
export function Header({ mood }: { mood: Mood | null }) {
  return (
    <header className={s.header}>
      <Link className={s.brand} href="/" aria-label="Parity home">
        <span className={s.ingots} aria-hidden="true">
          <i />
          <i />
        </span>
        parity
      </Link>
      {mood && <MoodPill mood={mood} />}
    </header>
  );
}

function MoodPill({ mood }: { mood: Mood }) {
  const v = Math.max(0, Math.min(100, mood.value));
  const a = Math.PI * (v / 100);
  const x = 13 - 10 * Math.cos(a);
  const y = 14 - 10 * Math.sin(a);
  const colour = v >= 55 ? "#07A66B" : v <= 45 ? "#E5234B" : "#C77A00";
  return (
    <div className={s.mood} title={`CoinMarketCap Fear & Greed: ${mood.value} (${mood.classification})`}>
      <svg width="26" height="16" viewBox="0 0 26 16" aria-hidden="true">
        <path d="M3 14a10 10 0 0 1 20 0" fill="none" stroke="#E4E4E8" strokeWidth="3" strokeLinecap="round" />
        {v > 0 && (
          <path d={`M3 14A10 10 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`} fill="none" stroke={colour} strokeWidth="3" strokeLinecap="round" />
        )}
      </svg>
      <span className={s.moodLabel}>Crypto mood</span>
      <strong>
        {mood.classification} {Math.round(mood.value)}
      </strong>
    </div>
  );
}
