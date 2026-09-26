"use client";

/**
 * Client shell: owns the query, keeps it in the URL (?q=GOLD is shareable),
 * calls /api/check, and shows empty / loading / result / not-found / error.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { present, type CheckResponse, type Mood } from "@/lib/present";
import type { CheckBody } from "@/lib/run-check";
import { Coin } from "./Coin";
import { Evidence } from "./evidence/Evidence";
import { Header } from "./Header";
import { HeroCard } from "./reveal/HeroCard";
import { Lower } from "./reveal/Lower";
import { Reveal } from "./reveal/Reveal";
import { TokenList } from "./reveal/TokenList";
import { labelFor } from "@/lib/chips";
import { Search } from "./Search";
import c from "./Chrome.module.css";
import hero from "./reveal/Hero.module.css";

type State =
  | { status: "empty" }
  | { status: "loading"; q: string }
  | { status: "ready"; q: string; data: CheckResponse; run: string }
  | { status: "not_found"; q: string; suggestions: { symbol: string; name: string }[] }
  | { status: "error"; q: string; message: string };

/** API body → UI state. */
function toState(q: string, body: CheckBody): State {
  if (body.ok) return { status: "ready", q, data: body, run: `${q}:${body.generated_at}` };
  if (body.error === "not_found") return { status: "not_found", q, suggestions: body.suggestions ?? [] };
  return { status: "error", q, message: body.message };
}

export function Parity({
  initialQuery,
  initial,
  initialMood,
  seek,
  drawer,
}: {
  initialQuery: string;
  /** Rendered on the server for ?q= links. */
  initial: CheckBody | null;
  initialMood: Mood | null;
  seek: number | null;
  drawer: boolean;
}) {
  const [state, setState] = useState<State>(initial ? toState(initialQuery, initial) : { status: "empty" });
  const [mood, setMood] = useState(initialMood);
  const inflight = useRef<AbortController | null>(null);

  const load = useCallback(async (query: string) => {
    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    try {
      const res = await fetch(`/api/check?q=${encodeURIComponent(query)}`, { signal: ctrl.signal });
      const body = (await res.json()) as CheckBody;
      if (ctrl.signal.aborted) return;
      if (body.ok && body.mood) setMood(body.mood);
      setState(toState(query, body));
    } catch (err) {
      if ((err as Error).name !== "AbortError") setState({ status: "error", q: query, message: "We couldn't reach the server." });
    }
  }, []);

  /** A user action (submit, chip, back/forward): show loading now, then load. */
  const run = useCallback(
    (q: string, push: boolean) => {
      const query = q.trim();
      if (push) window.history.pushState({ q: query }, "", query ? `?q=${encodeURIComponent(query)}` : window.location.pathname);
      if (!query) {
        inflight.current?.abort();
        return setState({ status: "empty" });
      }
      setState({ status: "loading", q: query });
      void load(query);
    },
    [load],
  );

  useEffect(() => {
    const onPop = () => run(new URLSearchParams(window.location.search).get("q") ?? "", false);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [run]);

  const query = state.status === "empty" ? "" : state.q;
  const busy = state.status === "loading";
  const view = useMemo(() => (state.status === "ready" ? present(state.data) : null), [state]);

  return (
    <div className={`${c.shell} ${state.status === "empty" ? c.isEmpty : ""}`}>
      <Header mood={mood} />

      {state.status === "empty" && (
        <div className={c.empty}>
          <div className={c.emptyCoins} aria-hidden="true">
            <Coin size={64} ticker="PAXG" />
            <Coin size={64} ticker="XAUt" />
            <Coin size={64} ticker="CGO" />
            <Coin size={64} variant="ghost" />
          </div>
          <h1 className={c.emptyLine}>Is your tokenised gold actually gold?</h1>
        </div>
      )}

      <Search query={query} busy={busy} onSubmit={(q) => run(q, true)} />

      {state.status === "loading" && <LoadingCard label={labelFor(state.q)} />}

      {state.status === "ready" && view && (
        <main>
          <Reveal runKey={state.run} seek={seek}>
            <HeroCard view={view} />
            <TokenList view={view} />
            <Lower view={view} />
          </Reveal>
          <Evidence key={state.run} rows={view.evidence} mode={view.mode} defaultOpen={drawer} />
        </main>
      )}

      {state.status === "not_found" && (
        <MessageCard title={`We couldn't find “${state.q}”.`} body="Try a ticker like GOLD, NVDA or SPY.">
          {state.suggestions.length > 0 && (
            <div className={c.chips} style={{ justifyContent: "flex-start", margin: "16px 0 0", padding: 0 }}>
              {state.suggestions.map((s) => (
                <button key={s.symbol} type="button" className={c.chip} onClick={() => run(s.symbol, true)}>
                  {s.name} ({s.symbol})
                </button>
              ))}
            </div>
          )}
        </MessageCard>
      )}

      {state.status === "error" && <MessageCard title="That didn't work." body={state.message} />}
    </div>
  );
}

/** Skeleton that matches the hero's layout while the check runs. */
function LoadingCard({ label }: { label: string }) {
  return (
    <section className={`${hero.card} ${hero.hero} ${hero.loading}`} aria-busy="true" aria-live="polite">
      <div className={hero.top}>
        <div>
          <div className={hero.asset}>
            <Coin size={26} />
            <span>
              <strong>{label}</strong>
            </span>
          </div>
          <div className={hero.slot}>
            <div className={hero.checking}>
              <span className={hero.shimmer}>Weighing tokens</span>
            </div>
          </div>
        </div>
      </div>
      <div className={hero.loadingTrack} />
    </section>
  );
}

function MessageCard({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <section className={`${hero.card} ${hero.hero} ${hero.message}`} role="status">
      <h2>{title}</h2>
      <p>{body}</p>
      {children}
    </section>
  );
}
