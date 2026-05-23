"use client";

// Weekend (Fri/Sat) vs weekday share of this month's spend, with
// a 3-month-prior delta chip so the user sees lifestyle drift.
// Distinct from the analytics tab's day-of-week heatmap (per-day
// visualization) — this is one number with a trend signal.

import { useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, CalendarHeart } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { weekendSpendReport } from "@/lib/weekend-spend";
import { currentMonthKey } from "@/lib/dates";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

function fmtPct(p: number): string {
  return `${p > 0 ? "+" : ""}${Math.round(p * 100)}%`;
}

export function WeekendSpendCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const r = useMemo(() => {
    if (!hydrated) return null;
    return weekendSpendReport({
      entries,
      monthKey: currentMonthKey(),
    });
  }, [hydrated, entries]);

  if (!hydrated || !r) return null;
  if (r.current.total === 0) return null;

  const pct = Math.round(r.current.weekendShare * 100);
  const up = r.shareDelta > 0;
  const flat = Math.abs(r.shareDelta) < 0.02;
  const tone = flat ? "#A1A1AA" : up ? "#F87171" : "#34D399";

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <header className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CalendarHeart className="size-3 text-[color:var(--neon)]" />
          סופ״ש מול אמצע שבוע
        </span>
        <span
          className="text-[10px] font-semibold"
          style={{ color: tone }}
          dir="ltr"
          data-mono="true"
        >
          {fmtPct(r.shareDelta)} מול ממוצע
        </span>
      </header>

      <div className="flex h-3 w-full overflow-hidden rounded-full">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          style={{
            background: "linear-gradient(90deg, #A78BFA, #A78BFA66)",
          }}
        />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${100 - pct}%` }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          style={{
            background: "linear-gradient(90deg, #60A5FA, #60A5FA66)",
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/25 px-3 py-2">
          <span className="text-foreground">סופ״ש</span>
          <span
            className="font-semibold"
            style={{ color: "#A78BFA" }}
            data-mono="true"
            dir="ltr"
          >
            {ILS.format(r.current.weekendTotal)} · {pct}%
          </span>
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/25 px-3 py-2">
          <span className="text-foreground">אמצע שבוע</span>
          <span
            className="font-semibold"
            style={{ color: "#60A5FA" }}
            data-mono="true"
            dir="ltr"
          >
            {ILS.format(r.current.weekdayTotal)} · {100 - pct}%
          </span>
        </div>
      </div>

      <div
        className="flex items-center justify-between gap-2 rounded-2xl border border-white/8 bg-black/20 px-3 py-2 text-[10.5px]"
        style={{ color: tone }}
      >
        <span className="flex items-center gap-1 text-muted-foreground">
          {flat ? null : up ? (
            <ArrowUpRight className="size-3" />
          ) : (
            <ArrowDownRight className="size-3" />
          )}
          מול ממוצע 3 חודשים
        </span>
        <span data-mono="true" dir="ltr">
          {fmtPct(r.shareDelta)}
        </span>
      </div>
    </section>
  );
}
