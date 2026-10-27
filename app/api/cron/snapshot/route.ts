import { blobStore } from "@/lib/blob-store";
import { liveTransport } from "@/lib/cmc";
import { handleSnapshotCron } from "@/lib/snapshot-cron";
import watchlist from "@/scripts/watchlist.json";

// Daily private history snapshot, run by Vercel's cron (vercel.json). Off unless
// PARITY_SNAPSHOTS=on; only a request with CRON_SECRET may run it; answers counts, never data.
export const dynamic = "force-dynamic";
export const maxDuration = 300; // a small CMC plan paces calls ~4 s apart

export function GET(request: Request) {
  return handleSnapshotCron(request, { env: process.env, transport: liveTransport, store: blobStore, watchlist });
}
