"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Flame } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { computeTrackingStreak } from "@/lib/tracking-streak";

/**
 * Habit-formation surface. Counts consecutive days the user has
 * tracked at least one entry. Hidden when there's no data and on
 * day-0 (no streak to celebrate yet).
 *
 * Tone scales with streak length so a long-running user gets a
 * brighter visual reward than a fresh starter.
 */
export function TrackingStreakCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const streak = useMemo(() => {
    if (!hydrated) return null;
    return computeTrackingStreak({ entries });
  }, [hydrated, entries]);

  if (!hydrated || !streak) return null;
  if (streak.currentDays === 0 && streak.longestDays === 0) return null;

  const tone =
    streak.currentDays >= 14
      ? "#F87171"
      : streak.currentDays >= 7
        ? "#D4AF37"
        : streak.currentDays > 0
          ? "#34D399"
          : "#A1A1AA";

  const headline = streak.currentDays === 0
    ? "התחל מחדש את הרצף"
    : streak.currentDays === 1
      ? "יום עוקב"
      : `${streak.currentDays} ימים עוקבים`;

  const subtitle = streak.currentDays === 0
    ? `הרצף הארוך ביותר: ${streak.longestDays} ימים`
    : streak.currentDays >= streak.longestDays
      ? "שיא אישי"
      : `הרצף הארוך ביותר: ${streak.longestDays} ימים`;

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card flex items-center gap-3 rounded-3xl p-4"
    >
      <span
        className="flex size-11 items-center justify-center rounded-2xl"
        style={{ background: `${tone}22`, color: tone }}
      >
        <Flame className="size-5" strokeWidth={1.8} />
      </span>
      <div className="flex flex-1 flex-col leading-tight">
        <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          רצף תיעוד
        </span>
        <span
          data-mono="true"
          className="text-[18px] font-semibold text-foreground"
        >
          {headline}
        </span>
        <span className="text-[10.5px] text-muted-foreground">{subtitle}</span>
      </div>
    </motion.section>
  );
}
