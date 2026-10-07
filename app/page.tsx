import type { Metadata } from "next";
import { Desk } from "@/components/desk/Desk";
import { createClient } from "@/lib/data-source";
import type { Mood } from "@/lib/present";
import { headers } from "next/headers";
import { clientKey, siteLimiter, validQuery } from "@/lib/public-api";
import { rateLimitedBody, runCheck, type CheckBody } from "@/lib/run-check";

/**
 * Each ?q= link shares its own verdict card (/api/og?q=…). The metadata doesn't run the
 * check itself: that would make the page's own calls show up as cache hits in Evidence.
 */
export async function generateMetadata({ searchParams }: PageProps<"/">): Promise<Metadata> {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 40) ?? "";
  const title = q ? `${q.toUpperCase()}: is the token actually the thing? · Parity` : "Parity: is your tokenised asset actually the thing?";
  const description = q
    ? `Every token that claims to be ${q.toUpperCase()}: fair, rich, thin or ghost, and whether you could sell it later.`
    : "Type a ticker. See every token that claims to be it, whether it's fairly priced, and whether you can sell it later.";
  const image = { url: `/api/og${q ? `?q=${encodeURIComponent(q)}` : ""}`, width: 1200, height: 630, alt: title };
  return {
    title,
    description,
    openGraph: { title, description, images: [image], type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

// ?q=GOLD renders the result on the server (shareable). Design review: ?t=1560 freezes
// the reveal at that moment, ?drawer opens Evidence.
export default async function Page({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = one(sp.q)?.trim() ?? "";
  const t = one(sp.t);
  const seek = t !== undefined && t !== "" && Number.isFinite(Number(t)) ? Number(t) : null;

  // Server-rendered checks spend credits too, so they share the page's per-client budget.
  const gate = q ? siteLimiter(clientKey(await headers())) : null;
  const valid = q ? validQuery(q) : null;
  const initial: CheckBody | null = !q
    ? null
    : !valid
      ? { ok: false, error: "missing_query", message: "That doesn't look like a ticker or asset name." }
      : gate && !gate.ok
        ? rateLimitedBody(gate.retryAfter)
        : (await runCheck(valid)).body;
  const mood = initial?.ok ? initial.mood : await loadMood();

  return <Desk initialQuery={q} initial={initial} initialMood={mood} seek={seek} drawer={sp.drawer !== undefined} />;
}

async function loadMood(): Promise<Mood | null> {
  const r = await createClient().client.fearAndGreed();
  return r.ok ? r.data : null;
}
