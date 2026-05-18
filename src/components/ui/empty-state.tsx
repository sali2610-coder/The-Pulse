"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// Consistent empty-state slot used across dashboard tiles when there's no
// data to show (no entries, no rules, etc). Keeps tone soft so users
// don't read it as an error — pairs an icon, a Hebrew headline, an
// optional explanation, and an optional inline CTA.

type Props = {
  icon: React.ReactNode;
  title: string;
  description?: string;
  cta?: React.ReactNode;
  className?: string;
};

export function EmptyState({
  icon,
  title,
  description,
  cta,
  className,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={cn(
        "flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-6 text-center",
        className,
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-white/6 text-muted-foreground">
        {icon}
      </span>
      <div className="flex flex-col gap-1">
        <div className="text-sm font-medium text-foreground">{title}</div>
        {description ? (
          <div className="max-w-[28ch] text-[11px] leading-relaxed text-muted-foreground">
            {description}
          </div>
        ) : null}
      </div>
      {cta ? <div className="mt-1">{cta}</div> : null}
    </motion.div>
  );
}
