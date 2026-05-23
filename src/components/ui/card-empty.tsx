"use client";

// Premium per-card empty state.
//
// Differs from <EmptyState> (used as a centered block inside a card
// body) by being compact enough to live in any card without
// stealing real estate. Three Hebrew slots: title, reason ("why
// nothing yet"), unlock hint ("what will populate this").

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Props = {
  icon?: React.ReactNode;
  title: string;
  /** Why the card is empty today. */
  reason: string;
  /** What the user can do to unlock it. */
  unlockHint?: string;
  cta?: React.ReactNode;
  className?: string;
};

export function CardEmpty({
  icon,
  title,
  reason,
  unlockHint,
  cta,
  className,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className={cn(
        "flex items-start gap-3 rounded-2xl border border-dashed border-white/12 bg-white/[0.02] p-4",
        className,
      )}
    >
      {icon ? (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/8 text-muted-foreground">
          {icon}
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[12.5px] font-medium text-foreground">
          {title}
        </span>
        <span className="text-[11px] leading-relaxed text-muted-foreground">
          {reason}
        </span>
        {unlockHint ? (
          <span className="text-[10.5px] text-muted-foreground/85">
            {unlockHint}
          </span>
        ) : null}
        {cta ? <div className="mt-1">{cta}</div> : null}
      </div>
    </motion.div>
  );
}
