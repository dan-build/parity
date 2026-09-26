"use client";

import { useEffect, useRef, useState } from "react";
import { CHIPS, labelFor, queryFor } from "@/lib/chips";
import { SearchGlyph } from "./icons";
import s from "./Chrome.module.css";

export function Search({ query, busy, onSubmit }: { query: string; busy: boolean; onSubmit: (q: string) => void }) {
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
    <section className={s.search}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onSubmit(queryFor(text));
        }}
      >
        <label className={s.field}>
          <SearchGlyph />
          <input
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Gold, Nvidia, Tesla…"
            aria-label="Search a tokenised asset"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="search"
          />
          <span className={s.kbd} aria-hidden="true">
            ⌘K
          </span>
          <button className={s.go} type="submit" disabled={busy}>
            Check
          </button>
        </label>
      </form>
      <div className={s.chips} aria-label="Try one">
        {CHIPS.map((c) => (
          <button
            key={c.q}
            type="button"
            className={s.chip}
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
    </section>
  );
}
