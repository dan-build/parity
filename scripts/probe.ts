/**
 * CMC endpoint probe + fixture recorder.
 *
 * Runs the engine's real calls (check()) for GOLD and NVDA through a recording
 * transport, so fixtures/ holds exactly what the engine asks for, plus:
 * - pools for GHOST wrappers too (fixtures are a superset of engine calls)
 * - key/info, issuers, Fear & Greed, liquidations, market-pairs (403 on Startup)
 *
 * Writes fixtures/<request>.json, fixtures/_index.json, fixtures/_probe-summary.json.
 * Run: npm run probe   (reads CMC_API_KEY from .env.local)
 *
 * The API key is only ever sent as a request header. It is never logged or saved.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { check } from "@/lib/check";
import { clearCmcCache, createCmcClient, isSupportedDexChain, liveTransport } from "@/lib/cmc";
import { recordingTransport } from "@/lib/cmc-fixtures";

const FIXTURES = join(process.cwd(), "fixtures");
const ASSETS = ["GOLD", "NVDA"];

const KEY = process.env.CMC_API_KEY;
if (!KEY) {
  console.error("CMC_API_KEY missing. Put it in .env.local and run `npm run probe`.");
  process.exit(1);
}

const client = createCmcClient({ transport: recordingTransport(liveTransport(KEY), FIXTURES), source: "live" });
const usedToday = (r: Awaited<ReturnType<typeof client.get>>) => {
  const d = r.ok ? (r.data as { data?: { usage?: { current_day?: { credits_used?: number } } } }) : null;
  return d?.data?.usage?.current_day?.credits_used ?? null;
};

async function main() {
  const before = usedToday(await client.get("/v1/key/info"));

  // Engine calls, exactly as /api/check makes them.
  const rwaIds: Record<string, number> = {};
  for (const sym of ASSETS) {
    const out = await check(sym, client);
    if (out.kind !== "ok") {
      console.log(`check(${sym}) → ${out.kind}`);
      continue;
    }
    const r = out.result;
    rwaIds[sym] = r.asset.rwa_id;
    console.log(`check(${sym}) → ${r.verdict} via ${r.wrappers.find((w) => w.crypto_id === r.headline_crypto_id)?.symbol ?? "—"}`);

    // Superset: pools for GHOST wrappers on supported chains too.
    const ghostIds = r.wrappers.filter((w) => !w.dex.checked).map((w) => w.crypto_id);
    const info = await client.cryptoInfo(r.wrappers.map((w) => w.crypto_id)); // cached
    if (info.ok) {
      for (const id of ghostIds) {
        const c = info.data.get(id);
        if (c && isSupportedDexChain(c.platform_slug)) await client.dexTokenPools(c.platform_slug, c.address);
      }
    }
  }

  // Extra probes (not used by the engine yet).
  const issuers = await client.get("/v5/real-world-assets/issuers/list", { limit: 100 });
  const firstIssuer = issuers.ok
    ? (issuers.data as { data?: { issuers?: { issuer_id?: string }[] } }).data?.issuers?.[0]?.issuer_id
    : undefined;
  if (firstIssuer) await client.get("/v5/real-world-assets/issuers", { issuer_id: firstIssuer });
  for (const sym of ASSETS) {
    if (rwaIds[sym]) await client.get("/v5/real-world-assets/market-pairs/list", { rwa_id: rwaIds[sym], limit: 50 });
  }
  await client.get("/v3/fear-and-greed/latest");
  await client.get("/v5/derivatives/liquidations/quotes/latest");
  await client.get("/v5/derivatives/liquidations/exchange/list/latest", { limit: 10 });
  await client.get("/v5/derivatives/liquidations/cryptocurrency/list/latest", { limit: 10 });

  clearCmcCache(); // so the second key/info call is real
  const after = usedToday(await client.get("/v1/key/info"));

  const rows = client.evidence.filter((e) => !e.cached);
  for (const e of rows) {
    const ok = e.status !== null && e.status >= 200 && e.status < 300;
    const params = Object.entries(e.params).map(([k, v]) => `${k}=${String(v).slice(0, 14)}`).join("&");
    console.log(`${ok ? "OK  " : "FAIL"} ${String(e.status ?? "---").padEnd(4)} credits=${String(e.credit_count ?? "?").padEnd(2)} ${e.endpoint}${params ? `?${params}` : ""}`);
  }

  writeFileSync(
    join(FIXTURES, "_probe-summary.json"),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        assets: ASSETS,
        rwa_ids: rwaIds,
        credits_used_today: { before, after, delta: before !== null && after !== null ? after - before : null },
        calls: rows.map((e) => ({ ...e, excerpt: undefined })),
      },
      null,
      2,
    ) + "\n",
  );
  const okCount = rows.filter((e) => e.status !== null && e.status < 300).length;
  console.log(`\n${okCount}/${rows.length} calls OK. Credits today: ${before} → ${after}. Index: fixtures/_index.json`);
}

main().catch((err) => {
  console.error("probe crashed:", err);
  process.exit(1);
});
