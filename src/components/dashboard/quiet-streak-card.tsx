"use client";

// Quiet-days streak nudge. "You haven't spent in N days" is the
// motivational counterpoint to the burn-rate cards. Auto-hides
// when the current streak is 0 (just spent today → nothing to
// celebrate yet) AND the longest streak is below a meaningful
// threshold.

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Moon } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { quietStreakReport } from "@/lib/quiet-streak";

function pluralDays(n: number): string {
  if (n === 1) return "יום";
  return `${n} ימים`;
}

export function QuietStreakCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const r = useMemo(() => {
    if (!hydrated) return null;
    return quietStreakReport({ entries, windowDays: 60 });
  }, [hydrated, entries]);

  if (!hydrated || !r) return null;
  // Surface only when there's something motivating to show — at
  // least a 2-day current streak OR a 5-day record longest.
  if (r.currentStreak < 2 && r.longestStreak < 5) return null;

  const tone =
    r.currentStreak >= 7
      ? "#34D399"
      : r.currentStreak >= 3
        ? "#FCD34D"
        : "#A1A1AA";

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <header className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Moon className="size-3 text-[color:var(--neon)]" />
          ימי שקט
        </span>
        <span className="text-[10px] text-muted-foreground/80">
          חלון 60 ימים
        </span>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex items-baseline justify-between gap-3"
      >
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            רצף נוכחי
          </span>
          <span
            data-mono="true"
            dir="ltr"
            className="text-[22px] font-semibold"
            style={{ color: tone }}
          >
            {r.currentStreak === 0 ? "—" : pluralDays(r.currentStreak)}
          </span>
        </div>
        <div className="flex flex-col items-end leading-tight">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            שיא חודשיים
          </span>
          <span
            data-mono="true"
            dir="ltr"
            className="text-[14px] text-muted-foreground"
          >
            {pluralDays(r.longestStreak)}
          </span>
        </div>
      </motion.div>

      <p className="text-[10px] text-muted-foreground/80">
        {r.quietDays} מתוך {r.windowDays} ימים בלי הוצאה חדשה.
      </p>
    </section>
  );
}
