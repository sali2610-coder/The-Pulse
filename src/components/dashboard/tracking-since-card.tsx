"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { computeTrackingSince } from "@/lib/tracking-since";

const DATE_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

function durationLabel(totalDays: number): string {
  if (totalDays < 14) return `${totalDays} ימים`;
  if (totalDays < 60) {
    const weeks = Math.floor(totalDays / 7);
    return `${weeks} שבועות`;
  }
  const months = Math.floor(totalDays / 30);
  if (months < 12) return `${months} חודשים`;
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (remMonths === 0) return `${years} שנים`;
  return `${years} שנים ו־${remMonths} חודשים`;
}

/**
 * Soft anniversary surface — "you've been tracking with Sally for
 * X". Renders only after at least 7 days of history so a fresh
 * install doesn't see a hollow "0 days" widget. Pure read over the
 * earliest createdAt across every persisted entity.
 */
export function TrackingSinceCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const loans = useFinanceStore((s) => s.loans);
  const accounts = useFinanceStore((s) => s.accounts);
  const incomes = useFinanceStore((s) => s.incomes);

  const since = useMemo(() => {
    if (!hydrated) return null;
    return computeTrackingSince({
      entries,
      rules,
      loans,
      accounts,
      incomes,
    });
  }, [hydrated, entries, rules, loans, accounts, incomes]);

  if (!hydrated || !since) return null;
  if (since.totalDays < 7) return null;

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card flex items-center gap-3 rounded-3xl p-4"
    >
      <span className="flex size-10 items-center justify-center rounded-2xl bg-gold/15 text-gold">
        <Sparkles className="size-5" strokeWidth={1.7} />
      </span>
      <div className="flex flex-1 flex-col leading-tight">
        <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          איתך מאז
        </span>
        <span className="text-[15px] font-semibold text-foreground">
          {durationLabel(since.totalDays)} עם Sally
        </span>
        <span className="text-[10.5px] text-muted-foreground">
          {DATE_FMT.format(new Date(since.startedAt))}
        </span>
      </div>
    </motion.section>
  );
}
