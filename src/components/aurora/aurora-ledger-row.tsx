"use client";

// Phase 432 · AURORA v1 — LedgerRow
//
// Right-plumb data row. Anatomy (RTL):
//   [accent dot] [label] [meta]                       [amount]
//
// Amount color follows direction per HIG critique #7:
//   "out"     = --aurora-row-out (ink-1)
//   "in"      = --aurora-row-in (state-safe)
//   "pending" = --aurora-row-pending (ink-3)
//
// Tap target ≥44pt enforced via .aurora-ledger-row CSS. When
// onClick is set the whole row becomes a real <button> with
// focus-ring + aria-label. Otherwise renders a non-interactive
// <li>-friendly span.

import { type ReactNode } from "react";

export type LedgerRowProps = {
  label: ReactNode;
  meta?: ReactNode;
  amount: ReactNode;
  direction?: "out" | "in" | "pending";
  accent?: ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
  className?: string;
};

export function LedgerRow({
  label,
  meta,
  amount,
  direction = "out",
  accent,
  onClick,
  ariaLabel,
  className,
}: LedgerRowProps) {
  const inner = (
    <span className="aurora-ledger-row-inner">
      <span className="aurora-ledger-row-leading">
        {accent ? <span className="aurora-ledger-row-accent">{accent}</span> : null}
        <span className="aurora-ledger-row-label">{label}</span>
        {meta ? (
          <span className="aurora-ledger-row-meta">{meta}</span>
        ) : null}
      </span>
      <span
        dir="ltr"
        className="aurora-ledger-row-amount"
        data-aurora-direction={direction}
      >
        {amount}
      </span>
    </span>
  );

  const classes = ["aurora-ledger-row", className].filter(Boolean).join(" ");

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={`${classes} aurora-ledger-row-tappable`}
      >
        {inner}
      </button>
    );
  }
  return <span className={classes}>{inner}</span>;
}

// Helper — standard 8pt accent dot in a lane color.
export function LaneDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="aurora-lane-dot"
      style={{ background: color }}
    />
  );
}
