"use client";

// Phase 432 · AURORA v1 — BentoGrid + BentoItem
//
// Mobile-first 6-column grid. Each BentoItem spans a token-keyed
// number of columns (1-6) and an optional number of rows (1-3).
// The grid handles the gap (16pt default) and wraps row spans
// using CSS grid-row.
//
// Phone target: 6-col phone grid. Larger viewports (tablet) get
// the same 6-col layout — the layout is intentionally consistent;
// we are mobile-first.

import { type ReactNode } from "react";

export type BentoColSpan = 1 | 2 | 3 | 4 | 5 | 6;
export type BentoRowSpan = 1 | 2 | 3;

export type BentoGridProps = {
  children: ReactNode;
  /** Token-keyed gap between cells (default 16pt). */
  gap?: "tight" | "comfortable" | "spacious";
  className?: string;
};

export function BentoGrid({
  children,
  gap = "comfortable",
  className,
}: BentoGridProps) {
  const classes = [
    "aurora-bento",
    `aurora-bento-gap-${gap}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <div className={classes}>{children}</div>;
}

export type BentoItemProps = {
  children: ReactNode;
  /** Phone columns to span (default 3 — half-width). */
  span?: BentoColSpan;
  /** Rows to span (default 1). */
  rowSpan?: BentoRowSpan;
  className?: string;
};

export function BentoItem({
  children,
  span = 3,
  rowSpan = 1,
  className,
}: BentoItemProps) {
  return (
    <div
      className={["aurora-bento-item", className].filter(Boolean).join(" ")}
      style={{
        gridColumn: `span ${span}`,
        gridRow: `span ${rowSpan}`,
      }}
    >
      {children}
    </div>
  );
}
