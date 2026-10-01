import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SUPPORTED_DEX_CHAINS } from "./cmc";
import {
  DEPTH_TIERS,
  DISCOUNT_WARN_PCT,
  GRAMS_PER_TROY_OUNCE,
  METHOD_VERSION,
  OFF_TRACK_PCT,
  PER_GRAM_TOLERANCE,
  RICH_PREMIUM_PCT,
  THIN_BELOW,
  TRADFI_POINTS,
  VOLUME_TIERS,
} from "./verdict";

const doc = readFileSync(join(process.cwd(), "METHOD.md"), "utf8");
const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

describe("METHOD.md matches the code", () => {
  it("states the current version and has a changelog entry for it", () => {
    expect(doc).toContain(`**Method version ${METHOD_VERSION}**`);
    expect(doc).toMatch(new RegExp(`^### ${METHOD_VERSION.replace(/\./g, "\\.")} \\(`, "m"));
  });

  it("documents every threshold with the value the engine uses", () => {
    expect(doc).toContain(`**±${PER_GRAM_TOLERANCE * 100}%**`);
    expect(doc).toContain(`**${GRAMS_PER_TROY_OUNCE}**`);
    expect(doc).toContain(`more than **${OFF_TRACK_PCT}%** above or below`);
    expect(doc).toContain(`Exit score below **${THIN_BELOW}**`);
    expect(doc).toContain(`premium above **+${RICH_PREMIUM_PCT}%**`);
    expect(doc).toContain(`discount beyond **−${Math.abs(DISCOUNT_WARN_PCT)}%**`);
    expect(doc).toContain(`| Listed on a traditional exchange | ${TRADFI_POINTS} |`);
  });

  it("lists the same exit tiers and DEX chains", () => {
    const row = (tiers: [number, number][]) => tiers.map(([min, pts]) => `≥ ${usd(min)} → ${pts}`).join(" · ");
    expect(doc).toContain(`| 24h volume | ${row(VOLUME_TIERS)} |`);
    expect(doc).toContain(`| ${row(DEPTH_TIERS)} |`);
    expect(SUPPORTED_DEX_CHAINS).toEqual(["ethereum", "solana", "bsc"]); // named in METHOD.md §8 and §12
  });
});
