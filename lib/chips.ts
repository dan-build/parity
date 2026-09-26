/**
 * The quick-pick assets under the search field. All have fixtures, and between them they
 * show all four verdicts: FAIR (most), THIN (SILVER), RICH (UNH), GHOST (KLAC; MS too).
 */
export const CHIPS = [
  { label: "Gold", q: "GOLD" },
  { label: "Nvidia", q: "NVDA" },
  { label: "S&P 500", q: "SPY" },
  { label: "Tesla", q: "TSLA" },
  { label: "Apple", q: "AAPL" },
  { label: "Silver", q: "SILVER" },
  { label: "UnitedHealth", q: "UNH" },
  { label: "KLA", q: "KLAC" },
] as const;

/** Chip label for a query, so "GOLD" shows as "Gold" in the field. */
export const labelFor = (q: string) => CHIPS.find((c) => c.q.toLowerCase() === q.trim().toLowerCase())?.label ?? q;

/** Query for what's typed, so "gold" or "Gold" both check GOLD. */
export const queryFor = (text: string) => CHIPS.find((c) => c.label.toLowerCase() === text.trim().toLowerCase())?.q ?? text.trim();
