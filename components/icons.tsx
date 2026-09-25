/** Glyphs from the design reference. Stroke uses currentColor unless noted. */
import type { Verdict } from "@/lib/verdict";
import type { GapView, Tone } from "@/lib/present";

type P = { size?: number; className?: string };

export function VerdictGlyph({ verdict, size = 14 }: { verdict: Verdict; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {verdict === "FAIR" && <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />}
      {verdict === "RICH" && <path d="M12 19V6M6.5 11.5 12 6l5.5 5.5" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />}
      {verdict === "THIN" && <path d="M4 12h16" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />}
      {verdict === "GHOST" && <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="2.6" strokeDasharray="3 3" />}
    </svg>
  );
}

/** Reason icon: glyph inside a tinted rounded square. */
export function ReasonGlyph({ tone }: { tone: Tone }) {
  const common = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (tone) {
    case "fair":
      return <svg {...common} stroke="#07A66B" strokeWidth="3"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
    case "unit":
      return <svg {...common} stroke="#A8751A" strokeWidth="3"><path d="M5 9h14M5 15h14" /></svg>;
    case "rich":
      return <svg {...common} stroke="#E5234B" strokeWidth="3"><path d="M12 19V5M6 11l6-6 6 6" /></svg>;
    case "thin":
      return <svg {...common} stroke="#C77A00" strokeWidth="3"><path d="M5 12h14" /></svg>;
    case "exit":
      return <svg {...common} stroke="#3A3A3F" strokeWidth="2.6"><path d="M5 19V13M10 19V10M15 19V7M20 19V4" /></svg>;
    case "ghost":
      return <svg {...common} stroke="#8E8E95" strokeWidth="2.4" strokeDasharray="3 3.2"><circle cx="12" cy="12" r="8" /></svg>;
    case "off":
      return <svg {...common} stroke="#E5234B" strokeWidth="2.8"><path d="M3 15 L8 7 L12 15 L16 7 L21 15" /></svg>;
  }
}

export function GapGlyph({ icon }: { icon: GapView["icon"] }) {
  const common = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "#76767C", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (icon) {
    case "exchange":
      return <svg {...common}><path d="M4 7h12l-3-3M20 17H8l3 3" /></svg>;
    case "waves":
      return (
        <svg {...common}>
          <path d="M3 15c3 0 3-3 6-3s3 3 6 3 3-3 6-3" />
          <path d="M3 20c3 0 3-3 6-3s3 3 6 3 3-3 6-3" opacity=".5" />
        </svg>
      );
    case "target":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <rect x="4" y="10" width="16" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      );
    case "info":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
      );
  }
}

export function SearchGlyph({ size = 20, className }: P) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function BreakMark({ className }: P) {
  return (
    <svg className={className} viewBox="0 0 18 20" aria-hidden="true">
      <path d="M2 14 L7 6 L11 14 L16 6" fill="none" stroke="#C4C4CA" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
