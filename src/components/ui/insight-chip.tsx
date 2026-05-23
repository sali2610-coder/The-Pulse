"use client";

// Severity-tagged chip for inline alerts / tips. Differs from <Pill>
// (which is a neutral category badge) by carrying a semantic severity
// + an optional label/value pair so the chip can act as a one-glance
// summary inside a tight card.
//
// Used by Smart Recommendations, Subscription Review, Spending Diet,
// and any future insight surface.

import * as React from "react";
import { cn } from "@/lib/utils";

export type InsightSeverity = "info" | "watch" | "warn" | "critical";

const TONE_BG: Record<InsightSeverity, string> = {
  info: "bg-[#34D399]/14",
  watch: "bg-gold/15",
  warn: "bg-destructive/15",
  critical: "bg-destructive/30",
};

const TONE_FG: Record<InsightSeverity, string> = {
  info: "text-[#34D399]",
  watch: "text-gold",
  warn: "text-destructive",
  critical: "text-destructive",
};

type Props = {
  severity?: InsightSeverity;
  icon?: React.ReactNode;
  label?: React.ReactNode;
  /** Mono value rendered next to the label (LTR auto). */
  value?: React.ReactNode;
  className?: string;
};

export function InsightChip({
  severity = "info",
  icon,
  label,
  value,
  className,
}: Props) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold leading-none",
        TONE_BG[severity],
        TONE_FG[severity],
        className,
      )}
      dir="ltr"
    >
      {icon ? <span className="inline-flex [&>svg]:size-2.5" aria-hidden>{icon}</span> : null}
      {label ? <span>{label}</span> : null}
      {value ? (
        <span data-mono="true" className="font-semibold">
          {value}
        </span>
      ) : null}
    </span>
  );
}
