import { describe, expect, it } from "vitest";
import watchlist from "../scripts/watchlist.json";
import { clearCmcCache } from "./cmc";
import { fixtureTransport } from "./cmc-fixtures";
import { dayPath, handleSnapshotCron, type CronDeps } from "./snapshot-cron";

const SECRET = "test-secret-0123456789";
const NOW = new Date("2026-10-09T03:00:12Z");

function setup(env: Record<string, string | undefined> = {}) {
  const writes: { path: string; body: string }[] = [];
  const deps: CronDeps = {
    env: { PARITY_SNAPSHOTS: "on", CRON_SECRET: SECRET, CMC_API_KEY: "k", ...env },
    transport: () => fixtureTransport("fixtures"),
    store: () => ({ put: async (path, body) => void writes.push({ path, body }) }),
    watchlist,
    now: NOW,
    paceOverrideMs: 0,
  };
  return { deps, writes };
}
const req = (auth?: string) => new Request("https://parity.test/api/cron/snapshot", { headers: auth ? { authorization: auth } : {} });

describe("the daily server snapshot", () => {
  it("is off unless switched on: 404, nothing fetched or written", async () => {
    const { deps, writes } = setup({ PARITY_SNAPSHOTS: undefined });
    let fetched = false;
    deps.transport = () => async () => ((fetched = true), { status: 200, body: {} });
    const res = await handleSnapshotCron(req(`Bearer ${SECRET}`), deps);
    expect(res.status).toBe(404);
    expect([fetched, writes.length]).toEqual([false, 0]);
  });

  it.each([
    ["no header", undefined, SECRET],
    ["the wrong secret", "Bearer not-the-secret-at-all", SECRET],
    ["no secret configured", "Bearer ", undefined],
    ["a secret too short to trust", "Bearer short", "short"],
  ])("refuses %s", async (_name, auth, secret) => {
    const { deps, writes } = setup({ CRON_SECRET: secret });
    const res = await handleSnapshotCron(req(auth), deps);
    expect(res.status).toBe(401);
    expect(writes).toEqual([]);
  });

  it("records every watched asset in one private file for the day, and answers counts only", async () => {
    clearCmcCache();
    const { deps, writes } = setup();
    const res = await handleSnapshotCron(req(`Bearer ${SECRET}`), deps);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    // No data in the answer: only these keys, all counts or flags.
    expect(Object.keys(body).sort()).toEqual(["credits", "failed", "kind", "of", "ok", "recorded"]);
    expect(body).toMatchObject({ ok: true, kind: "full", recorded: watchlist.length, of: watchlist.length, failed: 0 });

    expect(writes.map((w) => w.path)).toEqual(["history/full/2026-10-09.jsonl"]);
    const rows = writes[0].body.trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.map((r) => r.symbol).sort()).toEqual(watchlist.map((w) => w.symbol).sort());
    expect(rows.every((r) => r.kind === "full" && r.t === NOW.toISOString() && typeof r.verdict === "string")).toBe(true);
  });

  it("a repeated delivery the same day writes the same file again, not a second one", async () => {
    clearCmcCache();
    const { deps, writes } = setup();
    await handleSnapshotCron(req(`Bearer ${SECRET}`), deps);
    await handleSnapshotCron(req(`Bearer ${SECRET}`), deps);
    expect(new Set(writes.map((w) => w.path))).toEqual(new Set([dayPath(NOW)]));
  });

  it("keeps the credit reserve for the live site: skips without writing", async () => {
    const { deps, writes } = setup({ SNAPSHOT_RESERVE: "1000000" });
    const res = await handleSnapshotCron(req(`Bearer ${SECRET}`), deps);
    expect(await res.json()).toMatchObject({ ok: true, skipped: true, recorded: 0 });
    expect(writes).toEqual([]);
  });
});
