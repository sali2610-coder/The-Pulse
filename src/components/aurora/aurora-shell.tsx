"use client";

// Phase 430 · AURORA v1 — AuroraShell
//
// Root layout container. Provides:
//   - Canvas background (Aurora blobs + scrim)
//   - Always-on charcoal/cream base color (token-driven)
//   - Safe-area sentry for sticky chrome
//   - dir="rtl" lock (Hebrew-first; numeric containers opt out
//     locally via dir="ltr")
//
// Pure presentational. No store/engine reads. Children render
// above the canvas via z-index isolation.

import { type ReactNode } from "react";

import { AuroraCanvas } from "./aurora-canvas";

export function AuroraShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="aurora-shell relative isolate min-h-[100svh]"
      dir="rtl"
    >
      <AuroraCanvas />
      {children}
    </div>
  );
}
