/** The quick-pick assets under the search field (all six have fixtures). */
export const CHIPS = [
  { label: "Gold", q: "GOLD" },
  { label: "Nvidia", q: "NVDA" },
  { label: "S&P 500", q: "SPY" },
  { label: "Tesla", q: "TSLA" },
  { label: "Apple", q: "AAPL" },
  { label: "Silver", q: "SILVER" },
] as const;

/** Chip label for a query, so "GOLD" shows as "Gold" in the field. */
export const labelFor = (q: string) => CHIPS.find((c) => c.q.toLowerCase() === q.trim().toLowerCase())?.label ?? q;

/** Query for what's typed, so "gold" or "Gold" both check GOLD. */
export const queryFor = (text: string) => CHIPS.find((c) => c.label.toLowerCase() === text.trim().toLowerCase())?.q ?? text.trim();
