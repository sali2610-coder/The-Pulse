"use client";

// Phase 432 · AURORA v1 — WhisperCard
//
// Distinct from GlassCard: this is the CFO/AI insight surface.
// Per HIG critique #6 — visually distinct from bento via:
//   - 4pt gold left edge bar
//   - subtle gold inner glow (--aurora-whisper-glow)
//   - 2pt extra padding (more breathing room around the sentence)
//   - body content forced italic via the ConciergeSentence inside
//
// One mandatory child slot — the italic Gold sentence. Optional
// trailing actions row (two ghost buttons max).

import { type ReactNode } from "react";

import { ConciergeSentence } from "./aurora-concierge-sentence";

export type WhisperCardProps = {
  /** The Gold italic sentence. Will be rendered through
   *  ConciergeSentence to guarantee tone + line-length consistency. */
  sentence: ReactNode;
  /** Optional action row — usually 1-2 ghost buttons. */
  actions?: ReactNode;
  /** Variant; mirrors ConciergeSentence variants. */
  variant?: "loud" | "soft";
  className?: string;
};

export function WhisperCard({
  sentence,
  actions,
  variant = "loud",
  className,
}: WhisperCardProps) {
  return (
    <aside
      role="note"
      className={["aurora-whisper-card", className].filter(Boolean).join(" ")}
    >
      <span aria-hidden className="aurora-whisper-edge" />
      <div className="aurora-whisper-body">
        <ConciergeSentence variant={variant}>{sentence}</ConciergeSentence>
        {actions ? (
          <div className="aurora-whisper-actions">{actions}</div>
        ) : null}
      </div>
    </aside>
  );
}
