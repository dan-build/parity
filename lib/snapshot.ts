/**
 * One snapshot run, shared by the local script (scripts/snapshot.ts → history/) and the daily
 * server cron (app/api/cron/snapshot → private Blob). It decides nothing about storage: it
 * returns rows and where each belongs, and the caller writes them.
 *
 * Live data only, never the saved-data fallback: a failed asset is skipped, not filled in.
 * PRIVATE: the rows are CoinMarketCap data. They are stored for Parity's own use and never
 * published (CMC's terms).
 */
import { check, metalFor } from "./check";
import { createCmcClient, type CmcClient, type Transport } from "./cmc";
import { creditsLeft, dailyRow, historyPath, mayRun, monthlyLimit, paceMs, pickKind, priceRow, rateLimitPerMinute, type DailyRow, type PriceRow } from "./history";

export type WatchedAsset = { symbol: string; rwa_id: number };
export type SnapshotKind = "prices" | "full";

export type SnapshotOutcome = {
  kind: SnapshotKind;
  /** Why the run was skipped (credit reserve, unreadable key info); null when it ran. */
  skipped: string | null;
  /** Rows to store, with their monthly-file path under history/. */
  rows: { file: string; row: PriceRow | DailyRow }[];
  failures: string[];
  credits: number;
  pace_ms: number;
};

/** Spaces calls `gapMs` apart, one at a time. */
export function throttled(inner: Transport, gapMs: number): Transport {
  let last = 0;
  let chain: Promise<unknown> = Promise.resolve();
  return (req) => {
    const run = chain.then(async () => {
      const wait = last + gapMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      last = Date.now();
      return inner(req);
    });
    chain = run.catch(() => undefined);
    return run;
  };
}

/**
 * Read the key's plan (0 credits), pick the kind, check the credit reserve, then record every
 * watched asset through a client paced at half the key's per-minute limit.
 */
export async function takeSnapshot(opts: {
  transport: Transport;
  kind: SnapshotKind | "auto";
  watchlist: WatchedAsset[];
  reserve: number;
  now?: Date;
  /** Override the pacing (tests). */
  paceOverrideMs?: number;
}): Promise<SnapshotOutcome> {
  const now = opts.now ?? new Date();
  const info = await createCmcClient({ transport: opts.transport, source: "live" }).get("/v1/key/info");
  const kind = opts.kind === "auto" ? pickKind(info.ok ? monthlyLimit(info.data) : null, now.getUTCHours()) : opts.kind;
  const pace = opts.paceOverrideMs ?? paceMs(info.ok ? rateLimitPerMinute(info.data) : null);
  const cost = opts.watchlist.length * (kind === "prices" ? 1 : 7) + 2; // + spot for gold and silver
  const gate = mayRun(info.ok ? creditsLeft(info.data) : null, cost, opts.reserve);
  const outcome: SnapshotOutcome = { kind, skipped: gate.ok ? null : gate.why, rows: [], failures: [], credits: 0, pace_ms: pace };
  if (!gate.ok) return outcome;

  const client: CmcClient = createCmcClient({ transport: throttled(opts.transport, pace), source: "live" });
  const t = now.toISOString();
  for (const a of opts.watchlist) {
    if (kind === "prices") {
      const q = await client.rwaQuotesLatest(a.rwa_id);
      if (!q.ok || !q.data) {
        outcome.failures.push(`${a.symbol}: ${q.ok ? "no data" : q.message}`);
        continue;
      }
      const metal = metalFor(q.data);
      const s = metal ? await client.metalSpot(metal, q.data.last_updated) : null;
      outcome.rows.push({ file: historyPath("prices", a.symbol, t), row: priceRow(q.data, t, s?.ok ? { code: metal as string, ...s.data } : null) });
    } else {
      const r = await check(a.symbol, client);
      if (r.kind !== "ok" || r.result.asset.rwa_id !== a.rwa_id) {
        outcome.failures.push(`${a.symbol}: ${r.kind === "ok" ? `resolved to rwa_id ${r.result.asset.rwa_id}, expected ${a.rwa_id}` : r.kind === "error" ? r.message : "not found"}`);
        continue;
      }
      outcome.rows.push({ file: historyPath("daily", a.symbol, t), row: dailyRow(r.result, t) });
    }
  }
  outcome.credits = client.evidence.reduce((n, e) => n + (e.cached ? 0 : (e.credit_count ?? 0)), 0);
  return outcome;
}
