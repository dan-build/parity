/**
 * The daily server snapshot (app/api/cron/snapshot, scheduled in vercel.json). Vercel runs
 * crons on production only, so this starts once `next` is merged, and only when switched on.
 *
 * - Off unless PARITY_SNAPSHOTS=on: answers 404, as if the route didn't exist.
 * - Only Vercel's cron may run it: the request must carry `Authorization: Bearer $CRON_SECRET`.
 * - Writes one private file per day (history/full/YYYY-MM-DD.jsonl, every asset's row). A
 *   repeated delivery the same day overwrites that file instead of adding a duplicate.
 * - Answers with counts only, never data: this must not become a way to read CMC data.
 */
import { timingSafeEqual } from "node:crypto";
import type { Transport } from "./cmc";
import { takeSnapshot, type WatchedAsset } from "./snapshot";

/** Where the day's rows go. Production: a private Vercel Blob store (lib/blob-store.ts). */
export type SnapshotStore = { put(path: string, body: string): Promise<void> };

export type CronDeps = {
  env: Record<string, string | undefined>;
  transport: (key: string) => Transport;
  store: () => SnapshotStore;
  watchlist: WatchedAsset[];
  now?: Date;
  paceOverrideMs?: number;
};

export function dayPath(now: Date): string {
  return `history/full/${now.toISOString().slice(0, 10)}.jsonl`;
}

function authorised(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !header) return false;
  const want = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header);
  return got.length === want.length && timingSafeEqual(got, want);
}

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function handleSnapshotCron(request: Request, deps: CronDeps): Promise<Response> {
  if (deps.env.PARITY_SNAPSHOTS !== "on") return json({ ok: false, error: "not_found" }, 404);
  if (!authorised(request.headers.get("authorization"), deps.env.CRON_SECRET)) return json({ ok: false, error: "unauthorised" }, 401);
  const key = deps.env.CMC_API_KEY;
  if (!key) return json({ ok: false, error: "no_key" }, 500);

  const now = deps.now ?? new Date();
  const reserve = Number(deps.env.SNAPSHOT_RESERVE ?? 4000);
  const r = await takeSnapshot({ transport: deps.transport(key), kind: "full", watchlist: deps.watchlist, reserve, now, paceOverrideMs: deps.paceOverrideMs });
  const summary = { kind: r.kind, recorded: r.rows.length, of: deps.watchlist.length, credits: r.credits, failed: r.failures.length };
  if (r.skipped) {
    console.warn(`snapshot skipped: ${r.skipped}`);
    return json({ ok: true, skipped: true, ...summary }, 200);
  }
  for (const f of r.failures) console.warn(`snapshot ✗ ${f}`);
  if (r.rows.length) await deps.store().put(dayPath(now), r.rows.map(({ row }) => JSON.stringify(row)).join("\n") + "\n");
  return json({ ok: r.failures.length === 0, ...summary }, r.rows.length ? 200 : 502);
}
