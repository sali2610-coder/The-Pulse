"use client";

// Label/value pair used throughout cards. Centralizes:
//   * label = small uppercase muted token
//   * value = tabular-numeric, LTR for currency, right-aligned
//   * optional sub-line (e.g. "8% vs prior month") under the value
//   * optional `tone` to tint the value (success, warn, danger)
//
// The dashboard had ~20 hand-rolled versions of this pair. Collapsing
// them into one component made motion / typography consistent without
// changing visible output.

import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "warn" | "danger" | "neon";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "text-foreground",
  success: "text-[#34D399]",
  warn: "text-gold",
  danger: "text-destructive",
  neon: "text-[color:var(--neon)]",
};

type Props = {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: Tone;
  className?: string;
};

export function StatRow({ label, value, sub, tone = "neutral", className }: Props) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 py-0.5",
        className,
      )}
    >
      <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-col items-end leading-tight">
        <span
          data-mono="true"
          dir="ltr"
          className={cn("text-[13px] font-medium", TONE_CLASS[tone])}
        >
          {value}
        </span>
        {sub ? (
          <span className="text-[10px] text-muted-foreground/85" dir="ltr">
            {sub}
          </span>
        ) : null}
      </div>
    </div>
  );
}
