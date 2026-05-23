"use client";

// Section header used across every dashboard card. Standardizes:
//   * uppercase Hebrew label with 0.22em letter-spacing
//   * leading neon icon at fixed size
//   * optional right-aligned trailing slot (chip, count, action)
//
// Replaces the ad-hoc <header><Icon /> ... </header> pattern that was
// repeated in 30+ cards. Same DOM shape so visual diff is zero — this
// is purely a deduplication move.

import * as React from "react";
import { cn } from "@/lib/utils";

type Props = {
  icon?: React.ReactNode;
  title: React.ReactNode;
  /** Right-aligned trailing slot — typically a Pill, chip, count,
   *  or a small button. */
  trailing?: React.ReactNode;
  className?: string;
};

export function SectionHeader({ icon, title, trailing, className }: Props) {
  return (
    <header
      className={cn(
        "flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground",
        className,
      )}
    >
      <span className="flex items-center gap-1.5">
        {icon ? (
          <span className="text-[color:var(--neon)] [&>svg]:size-3" aria-hidden>
            {icon}
          </span>
        ) : null}
        {title}
      </span>
      {trailing ? <span className="flex items-center gap-1.5">{trailing}</span> : null}
    </header>
  );
}
