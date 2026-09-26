"use client";

/**
 * The page. Owns the query (kept in the URL, so ?q=GOLD is shareable), calls
 * /api/check, and shows empty / loading / result / not-found / error inside one
 * desk window: hero │ log on top, instrument │ log below, the full list underneath.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { labelFor } from "@/lib/chips";
import { present, type CheckResponse, type Mood } from "@/lib/present";
import type { CheckBody } from "@/lib/run-check";
import { Reveal } from "../reveal/Reveal";
import { Header } from "./Header";
import { Reasons, Tiles, Verdict } from "./Hero";
import { List } from "./List";
import { Log } from "./Log";
import { Stage } from "./Stage";
import s from "./Desk.module.css";

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

export function Desk({
  initialQuery,
  initial,
  initialMood,
  seek,
}: {
  initialQuery: string;
  /** Rendered on the server for ?q= links. */
  initial: CheckBody | null;
  initialMood: Mood | null;
  seek: number | null;
}) {
  const [state, setState] = useState<State>(initial ? toState(initialQuery, initial) : { status: "empty" });
  const [mood, setMood] = useState(initialMood);
  const [replays, setReplays] = useState(0);
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
  const view = useMemo(() => (state.status === "ready" ? present(state.data) : null), [state]);

  return (
    <div className={s.page}>
      <div className={s.wrap}>
        <Header mood={mood} query={query} busy={state.status === "loading"} onSubmit={(q) => run(q, true)} />

        {state.status === "ready" && view && (
          <Reveal runKey={`${state.run}:${replays}`} seek={seek}>
            <main className={s.window} data-verdict={view.headline.verdict}>
              <TitleBar title={`check ${view.asset.symbol}`} mode={view.mode} onReplay={() => setReplays((n) => n + 1)} />
              <div className={s.grid}>
                {/* DOM order is the phone order; desktop places these by grid area. */}
                <Verdict view={view} />
                <Log data={state.data} />
                <Stage view={view} />
                <Tiles view={view} />
                <Reasons view={view} />
                <List view={view} />
              </div>
            </main>
          </Reveal>
        )}

        {state.status === "loading" && (
          <main className={s.window} aria-busy="true">
            <TitleBar title={`check ${labelFor(state.q)}`} />
            <div className={s.message}>
              <p className={s.checking}>
                resolving {labelFor(state.q)}
                <b aria-hidden="true" />
              </p>
            </div>
          </main>
        )}

        {state.status === "empty" && (
          <main className={s.window}>
            <TitleBar title="start" />
            <div className={s.message}>
              <h1>Is your tokenised gold actually gold?</h1>
              <p>Pick an asset above. We check every token that claims to be it: the price, the units, and whether you could sell it later.</p>
            </div>
          </main>
        )}

        {state.status === "not_found" && (
          <main className={s.window} role="status">
            <TitleBar title={`check ${state.q}`} />
            <div className={s.message}>
              <h1>We couldn&apos;t find “{state.q}”.</h1>
              <p>Try a ticker like GOLD, NVDA or SPY.</p>
              {state.suggestions.length > 0 && (
                <div className={s.suggest}>
                  {state.suggestions.map((x) => (
                    <button key={x.symbol} type="button" onClick={() => run(x.symbol, true)}>
                      {x.name} <span>{x.symbol}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </main>
        )}

        {state.status === "error" && (
          <main className={s.window} role="status">
            <TitleBar title={`check ${state.q}`} />
            <div className={s.message}>
              <h1>That didn&apos;t work.</h1>
              <p>{state.message}</p>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}

function TitleBar({ title, mode, onReplay }: { title: string; mode?: "fixture" | "live"; onReplay?: () => void }) {
  return (
    <div className={s.titlebar}>
      <span className={s.dots} aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className={s.title}>parity — {title}</span>
      <span className={s.tools}>
        {onReplay && (
          <button type="button" onClick={onReplay} aria-label="Replay the check">
            replay
          </button>
        )}
        {mode && <em title={mode === "fixture" ? "Saved CoinMarketCap responses, replayed" : "Live CoinMarketCap data"}>{mode === "fixture" ? "saved" : "live"}</em>}
      </span>
    </div>
  );
}
