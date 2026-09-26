import { Desk } from "@/components/desk/Desk";
import { createClient } from "@/lib/data-source";
import type { Mood } from "@/lib/present";
import { runCheck } from "@/lib/run-check";

// ?q=GOLD renders the result on the server (shareable). Design review: ?t=1560 freezes
// the reveal at that moment, ?drawer opens Evidence.
export default async function Page({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = one(sp.q)?.trim() ?? "";
  const t = one(sp.t);
  const seek = t !== undefined && t !== "" && Number.isFinite(Number(t)) ? Number(t) : null;

  const initial = q ? (await runCheck(q)).body : null;
  const mood = initial?.ok ? initial.mood : await loadMood();

  return <Desk initialQuery={q} initial={initial} initialMood={mood} seek={seek} drawer={sp.drawer !== undefined} />;
}

async function loadMood(): Promise<Mood | null> {
  const source = createClient();
  if ("error" in source) return null;
  const r = await source.client.fearAndGreed();
  return r.ok ? r.data : null;
}
