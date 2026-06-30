"use client";

// Phase 432 · AURORA v1 — ConciergeSentence
//
// Gold italic sentence. The CFO voice. Variants:
//   - loud: --aurora-accent-gold-loud (or --aurora-state-insight)
//     Use for the dedicated Concierge note section.
//   - soft: --aurora-accent-gold-soft
//     Use for hero state lines and secondary whispers when the
//     screen already carries a louder gold sentence elsewhere.
//
// Single-loud-per-viewport rule lives at the composition layer:
// callers explicitly choose variant. There is NO runtime registry
// (review H1 + H2 from Phase 429 — explicit > implicit).

import { type ReactNode } from "react";

export type ConciergeSentenceProps = {
  children: ReactNode;
  variant?: "loud" | "soft";
  className?: string;
};

export function ConciergeSentence({
  children,
  variant = "loud",
  className,
}: ConciergeSentenceProps) {
  return (
    <p
      className={[
        "aurora-concierge-sentence",
        `aurora-concierge-${variant}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </p>
  );
}
