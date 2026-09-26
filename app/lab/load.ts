import { notFound } from "next/navigation";
import type { CheckResponse } from "@/lib/present";
import { runCheck } from "@/lib/run-check";

/** Lab pages always replay fixtures. ?q=NVDA switches asset, ?t=1560 freezes the reveal. */
export async function loadLab(searchParams: Promise<Record<string, string | string[] | undefined>>) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const q = one(sp.q)?.trim() || "GOLD";
  const t = one(sp.t);
  const { body } = await runCheck(q, "fixture");
  if (!body.ok) notFound();
  const data: CheckResponse = body;
  return { data, seek: t !== undefined && t !== "" && Number.isFinite(Number(t)) ? Number(t) : null };
}
