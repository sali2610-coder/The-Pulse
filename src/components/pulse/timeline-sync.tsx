"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { daysInMonth, projectMonth } from "@/lib/projections";

const formatPct = (n: number) => `${Math.max(0, Math.min(999, n)).toFixed(0)}%`;

type Props = {
  budget: number;
};

export function TimelineSync({ budget }: Props) {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);

  const monthKey = currentMonthKey();
  const today = new Date();
  const dayOfMonth = today.getDate();
  const totalDays = daysInMonth(monthKey);

  const { dayPct, spendPct, pace } = useMemo(() => {
    if (!hydrated || budget <= 0) {
      return { dayPct: 0, spendPct: 0, pace: 0 };
    }
    const proj = projectMonth({ entries, rules, statuses, monthKey });
    const dp = (dayOfMonth / totalDays) * 100;
    const sp = (proj.actual / budget) * 100;
    return { dayPct: dp, spendPct: sp, pace: sp - dp };
  }, [
    hydrated,
    entries,
    rules,
    statuses,
    monthKey,
    dayOfMonth,
    totalDays,
    budget,
  ]);

  const overpace = pace > 5;
  const onpace = Math.abs(pace) <= 5;
  const accent = overpace ? "#F87171" : onpace ? "#FACC15" : "#34D399";
  const verdict = overpace
    ? "קצב הוצאה גבוה מקצב הימים"
    : onpace
      ? "קצב מאוזן"
      : "קצב הוצאה מתון";

  return (
    <section className="rounded-2xl border border-border/60 bg-surface/50 p-4 backdrop-blur-md">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            Timeline Sync
          </div>
          <div className="mt-1 text-sm text-foreground">{verdict}</div>
        </div>
        <div
          data-mono="true"
          className="text-xs"
          style={{ direction: "ltr", color: accent }}
        >
          {pace > 0 ? `+${formatPct(pace)}` : formatPct(pace)}
        </div>
      </header>

      <div className="mt-4 space-y-3">
        <Track
          label="ימים שעברו"
          value={dayPct}
          color="rgba(255,255,255,0.55)"
          rightLabel={`${dayOfMonth} / ${totalDays}`}
        />
        <Track
          label="כסף שיצא"
          value={spendPct}
          color={accent}
          rightLabel={budget > 0 ? formatPct(spendPct) : "—"}
          glow
        />
      </div>

      <div className="mt-4 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">
        <span>1</span>
        <span>{Math.round(totalDays / 2)}</span>
        <span>{totalDays}</span>
      </div>
    </section>
  );
}

function Track({
  label,
  value,
  color,
  rightLabel,
  glow,
}: {
  label: string;
  value: number;
  color: string;
  rightLabel: string;
  glow?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span data-mono="true" style={{ direction: "ltr" }}>
          {rightLabel}
        </span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full border border-white/5 bg-black/40">
        <motion.div
          className="absolute inset-y-0 right-0 rounded-full"
          animate={{ width: `${clamped}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 22 }}
          style={{
            background: color,
            boxShadow: glow ? `0 0 14px -2px ${color}` : undefined,
          }}
        />
      </div>
    </div>
  );
}
