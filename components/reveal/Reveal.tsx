"use client";

/**
 * The reveal's single clock. One requestAnimationFrame loop owns time `t` (ms);
 * every animated element registers a `(t) => void` that writes its own style.
 * React never re-renders per frame.
 *
 * - `runKey` restarts the clock (a new result).
 * - `seek` freezes at a given t (design review: ?t=1560).
 * - Reduced motion renders the final state immediately.
 */
import { createContext, useCallback, useContext, useLayoutEffect, useRef, type ReactNode } from "react";
import { FINAL, T } from "@/lib/reveal/timings";

type Track = (t: number) => void;
type Register = (track: Track) => () => void;

const RevealContext = createContext<Register | null>(null);

export function Reveal({ runKey, seek, children }: { runKey: string; seek?: number | null; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const tracks = useRef(new Set<Track>());
  const now = useRef(0);

  const register = useCallback<Register>((track) => {
    tracks.current.add(track);
    track(now.current); // late registrants (e.g. after a resize) jump straight to the current time
    return () => {
      tracks.current.delete(track);
    };
  }, []);

  // Children's layout effects run first, so every track is registered before the first frame paints.
  useLayoutEffect(() => {
    const apply = (t: number) => {
      now.current = t;
      tracks.current.forEach((f) => f(t));
      // Server HTML is hidden until the first frame is applied, so it never flashes the final state.
      if (box.current) box.current.style.visibility = "visible";
    };
    if (seek !== null && seek !== undefined) {
      apply(seek);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      apply(FINAL);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const loop = (ts: number) => {
      const t = ts - t0;
      apply(t);
      if (t < T.end) raf = requestAnimationFrame(loop);
      else apply(FINAL);
    };
    apply(0);
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [runKey, seek]);

  return (
    <RevealContext.Provider value={register}>
      <div ref={box} data-reveal="" style={{ visibility: "hidden" }}>
        {children}
      </div>
      <noscript>
        <style>{`[data-reveal]{visibility:visible!important}`}</style>
      </noscript>
    </RevealContext.Provider>
  );
}

/**
 * Register a frame function with the clock. `frame` is re-registered when `deps` change
 * (e.g. new geometry after a resize) and immediately applied at the current time.
 */
export function useTrack(frame: Track, deps: unknown[]) {
  const register = useContext(RevealContext);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => (register ? register(frame) : undefined), [register, ...deps]);
}
