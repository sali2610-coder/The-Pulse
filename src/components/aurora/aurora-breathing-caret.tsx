"use client";

// Phase 432 · AURORA v1 — BreathingCaret
//
// CSS-only 6s sine breath. No JS animation, no rAF, no setState
// — the breath lives in @keyframes aurora-caret-breath and pauses
// automatically under prefers-reduced-motion (via the
// --aurora-dur-ambient token collapse).
//
// One instance per viewport per the constitution: the caret is
// the single Neon accent that breathes.

import { type CSSProperties } from "react";

export type BreathingCaretProps = {
  /** Pixel width. Default 96. */
  width?: number;
  className?: string;
  style?: CSSProperties;
};

export function BreathingCaret({
  width = 96,
  className,
  style,
}: BreathingCaretProps) {
  return (
    <span
      aria-hidden
      className={["aurora-breath-caret", className].filter(Boolean).join(" ")}
      style={{ width, ...style }}
    />
  );
}
