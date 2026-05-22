"use client";

// Multi-month obligations timeline. Surfaces the next N months of
// committed cashflow:
//   income           — incomes that fire that month
//   fixed            — recurring + installment plans (paid statuses excluded)
//   loans            — active loan installments
//   cardEntries      — already-existing entry slices firing that month
//   net              — income − total outflow (red when negative)
//
// Pure derivation from obligationsTimeline() — no extra store reads
// beyond what the snapshot already exposes.

import { useMemo } from "react";
import { motion } from "framer-motion";
import { CalendarRange } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey, addMonths } from "@/lib/dates";
import { obligationsTimeline, type MonthSummary } from "@/lib/obligations";
import { EASE_OUT_EXPO, STAGGER_TIGHT } from "@/lib/motion-tokens";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const MONTH_FMT = new Intl.DateTimeFormat("he-IL", {
  month: "short",
  year: "2-digit",
});

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return MONTH_FMT.format(new Date(Number(y), Number(m) - 1, 1));
}

const HORIZON = 3;

export function ObligationsTimelineCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const rules = useFinanceStore((s) => s.rules);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);
  const statuses = useFinanceStore((s) => s.statuses);

  const timeline = useMemo<MonthSummary[]>(() => {
    if (!hydrated) return [];
    return obligationsTimeline({
      rules,
      loans,
      incomes,
      entries,
      statuses,
      startMonth: currentMonthKey(),
      months: HORIZON,
    });
  }, [hydrated, rules, loans, incomes, entries, statuses]);

  if (!hydrated) return null;
  // Surface only when there's something meaningful to project.
  if (timeline.every((m) => m.outflow === 0 && m.income === 0)) return null;

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <header className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CalendarRange className="size-3 text-[color:var(--neon)]" />
          התחייבויות {HORIZON} חודשים
        </span>
        <span
          className="text-[10px] text-muted-foreground/80"
          dir="ltr"
          data-mono="true"
        >
          {monthLabel(timeline[0].monthKey)} →{" "}
          {monthLabel(addMonths(timeline[0].monthKey, HORIZON - 1))}
        </span>
      </header>

      <ul className="flex flex-col gap-2">
        {timeline.map((m, idx) => {
          const negative = m.net < 0;
          const tone = negative ? "#F87171" : "#34D399";
          return (
            <motion.li
              key={m.monthKey}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: idx * STAGGER_TIGHT,
                duration: 0.3,
                ease: EASE_OUT_EXPO,
              }}
              className="flex flex-col gap-1 rounded-2xl border border-white/8 bg-black/25 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-foreground">
                  {monthLabel(m.monthKey)}
                </span>
                <span
                  data-mono="true"
                  dir="ltr"
                  className="text-[13px] font-semibold"
                  style={{ color: tone }}
                >
                  {negative ? "" : "+"}
                  {ILS.format(m.net)}
                </span>
              </div>
              <div
                className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-muted-foreground"
                dir="ltr"
                data-mono="true"
              >
                {m.income > 0 ? <span>+ {ILS.format(m.income)} הכנסה</span> : null}
                {m.fixed > 0 ? (
                  <>
                    <span>·</span>
                    <span>− {ILS.format(m.fixed)} קבועים</span>
                  </>
                ) : null}
                {m.loans > 0 ? (
                  <>
                    <span>·</span>
                    <span>− {ILS.format(m.loans)} הלוואות</span>
                  </>
                ) : null}
                {m.cardEntries > 0 ? (
                  <>
                    <span>·</span>
                    <span>− {ILS.format(m.cardEntries)} כרטיס</span>
                  </>
                ) : null}
              </div>
            </motion.li>
          );
        })}
      </ul>

      <p className="text-[10px] text-muted-foreground/80">
        מבוסס על הוצאות קבועות + הלוואות + תשלומים פעילים + הכנסות. לא כולל
        הוצאות מזדמנות.
      </p>
    </section>
  );
}
