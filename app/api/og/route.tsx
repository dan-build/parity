/**
 * GET /api/og?q=NVDA → the 1200×630 share image for a verdict (Direction C: a white card
 * on the verdict's colour field). The field is pre-rendered per verdict (bg/*.jpg, made
 * from C's CSS by scripts/og-backgrounds.mjs) because Satori has no mask-image, blend
 * modes or SVG filters. Any failure still returns a branded image, never an error.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { dataMode } from "@/lib/data-source";
import { present, type View } from "@/lib/present";
import { clientKey, siteLimiter, validQuery } from "@/lib/public-api";
import { runCheck } from "@/lib/run-check";
import type { Verdict } from "@/lib/verdict";

const DIR = join(process.cwd(), "app/api/og");

/** C's colours for a white card. */
const INK: Record<Verdict, { fg: string; bg: string }> = {
  FAIR: { fg: "#0f8a5f", bg: "#e3f5ec" },
  RICH: { fg: "#d0314b", bg: "#fde7eb" },
  THIN: { fg: "#b87400", bg: "#fdf1dc" },
  GHOST: { fg: "#8a8a92", bg: "#f0f0f2" },
};

const asset = (path: string) => readFile(join(DIR, path));

export async function GET(request: Request) {
  // A check costs credits, so share images share the page's per-client budget and its input
  // rules. Over the limit, or with an invalid q, you get the plain card (no check runs).
  const q = validQuery(new URL(request.url).searchParams.get("q"));
  const allowed = q !== null && siteLimiter(clientKey(request.headers)).ok;
  let view: View | null = null;
  let degraded = false;
  try {
    const { body } = allowed ? await runCheck(q) : { body: null };
    if (body?.ok) {
      view = present(body);
      degraded = dataMode() === "live" && body.mode !== "live";
    }
  } catch {
    view = null; // fall through to the plain card
  }
  const verdict: Verdict = view?.headline.verdict ?? "GHOST";

  const [bg, sans500, sans600, mono] = await Promise.all([
    asset(`bg/${verdict.toLowerCase()}.jpg`),
    asset("fonts/Geist-500.ttf"),
    asset("fonts/Geist-600.ttf"),
    asset("fonts/GeistMono-500.ttf"),
  ]);

  return new ImageResponse(
    (
      <div style={{ position: "relative", display: "flex", width: "100%", height: "100%", fontFamily: "Geist" }}>
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={`data:image/jpeg;base64,${bg.toString("base64")}`} width={1200} height={630} style={{ position: "absolute", inset: 0 }} />
        <div style={{ display: "flex", flexDirection: "column", width: "100%", padding: "40px 56px 48px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#fff" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 30, fontWeight: 600, letterSpacing: -0.5 }}>
              <div style={{ width: 24, height: 24, borderRadius: 12, background: "radial-gradient(circle at 35% 30%, #fff4c9, #d9a73c 60%, #8a5d12)" }} />
              Parity
            </div>
            <div style={{ fontSize: 24, opacity: 0.9 }}>Is this token actually the thing?</div>
          </div>
          {view ? <Card view={view} /> : <Plain />}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Geist", data: sans500, weight: 500, style: "normal" },
        { name: "Geist", data: sans600, weight: 600, style: "normal" },
        { name: "Geist Mono", data: mono, weight: 500, style: "normal" },
      ],
      // Only a real, live-as-configured verdict is cached; a plain or degraded card never sticks.
      headers: { "Cache-Control": view && !degraded ? "public, max-age=300, s-maxage=900, stale-while-revalidate=86400" : "no-store" },
    },
  );
}

const card = {
  display: "flex",
  flex: 1,
  marginTop: 28,
  padding: "40px 48px",
  borderRadius: 32,
  background: "#fff",
  boxShadow: "0 30px 80px -30px rgba(0,0,0,.45)",
} as const;

function Card({ view }: { view: View }) {
  const ink = INK[view.headline.verdict];
  const facts = view.summary.filter((t) => t.label !== "Tokens checked");
  return (
    <div style={{ ...card, flexDirection: "row", gap: 40 }}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "Geist Mono", fontSize: 22, letterSpacing: 2, color: "#6b6b73", textTransform: "uppercase" }}>
          {/* The ticker, not the full name: "UNITEDHEALTH GROUP INC" would wrap. */}
          {`${view.asset.symbol} · ${view.asset.claimLine}`}
        </div>
        <div style={{ fontSize: 176, fontWeight: 600, letterSpacing: -9, lineHeight: 1, marginTop: 18, color: ink.fg }}>
          {view.headline.word}
        </div>
        <div style={{ display: "flex", marginTop: 20 }}>
          <div style={{ display: "flex", padding: "8px 18px", borderRadius: 14, fontSize: 30, fontWeight: 600, color: ink.fg, background: ink.bg }}>
            {view.headline.chip}
          </div>
        </div>
        <div style={{ fontSize: 30, color: "#4a4a52", marginTop: 18 }}>{view.headline.sub}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 300 }}>
        {facts.map((t) => (
          <div key={t.label} style={{ display: "flex", flexDirection: "column", padding: "14px 20px", borderRadius: 16, background: "#f5f5f7" }}>
            <div style={{ fontFamily: "Geist Mono", fontSize: 17, letterSpacing: 1.5, color: "#6b6b73", textTransform: "uppercase" }}>{t.label}</div>
            <div style={{ fontSize: 38, fontWeight: 600, letterSpacing: -1, color: "#111113" }}>{t.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Plain() {
  return (
    <div style={{ ...card, flexDirection: "column", justifyContent: "center" }}>
      <div style={{ fontSize: 84, fontWeight: 600, letterSpacing: -3, lineHeight: 1.05, color: "#111113" }}>
        Is your tokenised asset actually the thing?
      </div>
      <div style={{ fontSize: 32, color: "#4a4a52", marginTop: 24 }}>
        Fair, rich, thin or ghost: every token, checked.
      </div>
    </div>
  );
}
