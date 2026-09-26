"use client";

import { useState, type ReactNode } from "react";
import { Reveal } from "../reveal/Reveal";

/** The reveal clock plus a small Replay control for design review. */
export function LabShell({ seek, children, dark = false }: { seek: number | null; children: ReactNode; dark?: boolean }) {
  const [run, setRun] = useState(0);
  return (
    <>
      <Reveal runKey={String(run)} seek={seek}>
        {children}
      </Reveal>
      <button
        type="button"
        onClick={() => setRun((n) => n + 1)}
        style={{
          position: "fixed",
          right: 12,
          bottom: 12,
          zIndex: 50,
          height: 28,
          padding: "0 10px",
          borderRadius: 8,
          font: "500 12px/28px system-ui, sans-serif",
          color: dark ? "#EDEDEF" : "#3A3A3F",
          background: dark ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.9)",
          boxShadow: dark ? "0 0 0 1px rgba(255,255,255,.1)" : "0 0 0 1px rgba(10,10,20,.08)",
        }}
      >
        Replay
      </button>
    </>
  );
}
