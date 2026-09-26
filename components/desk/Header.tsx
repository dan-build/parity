"use client";

/** Brand, the command-bar search with its chips, and the crypto mood (Fear & Greed). */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CHIPS, labelFor, queryFor } from "@/lib/chips";
import type { Mood } from "@/lib/present";
import s from "./Header.module.css";

export function Header({
  mood,
  query,
  busy,
  onSubmit,
}: {
  mood: Mood | null;
  query: string;
  busy: boolean;
  onSubmit: (q: string) => void;
}) {
  const [text, setText] = useState(labelFor(query));
  const [shownQuery, setShownQuery] = useState(query);
  const input = useRef<HTMLInputElement>(null);

  // A new query (chip, back button) replaces what's in the field.
  if (query !== shownQuery) {
    setShownQuery(query);
    setText(labelFor(query));
  }

  // ⌘K / Ctrl+K focuses the field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const active = query.trim().toLowerCase();

  return (
    <header className={s.header}>
      <Link
        className={s.brand}
        href="/"
        aria-label="Parity home"
        onClick={(e) => {
          // Stay on the client: clearing the query resets the page to its empty state.
          e.preventDefault();
          onSubmit("");
        }}
      >
        <i aria-hidden="true" />
        Parity
      </Link>
      {mood && (
        <span className={s.mood} title={`CoinMarketCap Fear & Greed: ${mood.value} (${mood.classification})`}>
          <i aria-hidden="true" style={{ background: mood.value >= 55 ? "var(--fair)" : mood.value <= 45 ? "var(--rich)" : "var(--thin)" }} />
          <span className={s.moodLabel}>crypto mood</span> <b>{Math.round(mood.value)}</b> {mood.classification.toLowerCase()}
        </span>
      )}
      <form
        className={s.search}
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onSubmit(queryFor(text));
        }}
      >
        <label className={s.field}>
          <span className={s.prompt} aria-hidden="true">
            ›
          </span>
          <input
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="gold, nvidia, tesla…"
            aria-label="Search a tokenised asset"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="search"
          />
          <kbd aria-hidden="true">⌘K</kbd>
          <button type="submit" disabled={busy}>
            check
          </button>
        </label>
      </form>
      <div className={s.chips} aria-label="Try one">
        {CHIPS.map((c) => (
          <button
            key={c.q}
            type="button"
            aria-pressed={active === c.q.toLowerCase()}
            onClick={() => {
              setText(c.label);
              onSubmit(c.q);
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
    </header>
  );
}
