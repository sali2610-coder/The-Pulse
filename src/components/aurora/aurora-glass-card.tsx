"use client";

// Phase 432 · AURORA v1 — GlassCard
//
// Standard glass surface. Renders bg (var(--aurora-glass-{elev}))
// + backdrop-filter (blur-soft) + 1px border + rest shadow. The
// recipe lives entirely in CSS classes so dark/light flips happen
// automatically via the theme tokens.
//
// Variants
//   elevation: base | elev-1 (default) | elev-2
//   radius:    bento (default) | hero | modal | cinema | full
//   padding:   compact | comfortable (default) | spacious
//   tone:      neutral (default) | danger
//
// One responsibility — surface only. No headings, no slots, no
// section semantics. Composers add structure inside.

import { type ElementType, type ReactNode } from "react";

export type GlassCardProps = {
  children: ReactNode;
  /** Token-keyed glass elevation. */
  elevation?: "base" | "elev-1" | "elev-2";
  /** Token-keyed border radius. */
  radius?: "bento" | "hero" | "modal" | "cinema" | "full";
  /** Token-keyed inner padding. */
  padding?: "compact" | "comfortable" | "spacious";
  /** Tonal accent for the card edge — only "danger" wired today. */
  tone?: "neutral" | "danger";
  /** Optional element override (e.g., "article" / "section"). */
  as?: ElementType;
  className?: string;
};

export function GlassCard({
  children,
  elevation = "elev-1",
  radius = "bento",
  padding = "comfortable",
  tone = "neutral",
  as: Tag = "div",
  className,
}: GlassCardProps) {
  const classes = [
    "aurora-glass-card",
    `aurora-glass-${elevation}`,
    `aurora-glass-radius-${radius}`,
    `aurora-glass-pad-${padding}`,
    tone !== "neutral" ? `aurora-glass-tone-${tone}` : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <Tag className={classes}>{children}</Tag>;
}
