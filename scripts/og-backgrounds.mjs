/**
 * Renders the share image's backgrounds: Direction C's colour field, fully developed,
 * with its film grain, one per verdict → app/api/og/bg/<verdict>.jpg (1200×630).
 * Satori can't draw the mask, blend mode or feTurbulence grain, so we bake them once.
 *
 * Needs playwright-core (not a project dependency) and a Chromium:
 *   npm i --no-save playwright-core && CH=/path/to/chrome-headless-shell node scripts/og-backgrounds.mjs
 * (On this Mac: CH=$(find ~/.cache/parity-chrome -name chrome-headless-shell -type f).)
 */
import { join } from "node:path";
import { chromium } from "playwright-core";

const OUT = join(process.cwd(), "app/api/og/bg");
const F = {
  FAIR: ["#0e6b4f", "#3fb58a", "#d9f2e6"],
  RICH: ["#8e1b2e", "#e0566a", "#fbe2e6"],
  THIN: ["#8a5a06", "#e6a93a", "#fbefd6"],
  GHOST: ["#55555c", "#a5a5ad", "#ededf0"],
};
const grain = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 1.2 -0.1'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`;
const b = await chromium.launch({ executablePath: process.env.CH });
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
for (const [v, [f1, f2, f3]] of Object.entries(F)) {
  // C's .develop layer, fully developed (no mask), with C's film grain on top.
  // C's .develop layer, fully developed (no mask), with C's film grain on top.
  await p.setContent(`<html><head><style>
    body { margin: 0 }
    .f { position: relative; width: 1200px; height: 630px; isolation: isolate; overflow: hidden;
      background:
        radial-gradient(60% 50% at 18% 8%, color-mix(in srgb, ${f3} 55%, transparent), transparent 70%),
        radial-gradient(55% 60% at 92% 28%, color-mix(in srgb, ${f1} 70%, transparent), transparent 70%),
        linear-gradient(160deg, ${f1} 0%, ${f2} 55%, ${f3} 100%); }
    .g { position: absolute; inset: 0; opacity: .35; mix-blend-mode: overlay; background-image: ${grain}; }
  </style></head><body><div class="f"><div class="g"></div></div></body></html>`);
  await p.waitForTimeout(200);
  await p.screenshot({ path: join(OUT, `${v.toLowerCase()}.jpg`), type: "jpeg", quality: 86 });
}
await b.close();
