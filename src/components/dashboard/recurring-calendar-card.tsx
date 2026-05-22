"use client";

// 14-day per-day calendar of every scheduled commitment. Lists
// only days that actually have an event so the card stays calm
// when the week is quiet. Auto-hides on a fully empty window.

import { useMemo } from "react";
import { motion } from "framer-motion";
import { CalendarRange, ArrowDownRight, ArrowUpRight } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { recurringCalendar } from "@/lib/recurring-calendar";
import { EASE_OUT_EXPO, STAGGER_TIGHT } from "@/lib/motion-tokens";

const HORIZON = 14;

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

const KIND_LABEL: Record<string, string> = {
  recurring: "קבוע",
  "installment-plan": "תשלום",
  loan: "הלוואה",
  income: "הכנסה",
  "card-cycle": "מחזור כרטיס",
  "entry-slice": "חיוב",
};

export function RecurringCalendarCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const rules = useFinanceStore((s) => s.rules);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);
  const statuses = useFinanceStore((s) => s.statuses);

  const days = useMemo(() => {
    if (!hydrated) return [];
    return recurringCalendar({
      rules,
      loans,
      incomes,
      entries,
      statuses,
      days: HORIZON,
    });
  }, [hydrated, rules, loans, incomes, entries, statuses]);

  if (!hydrated) return null;
  const populated = days.filter((d) => d.items.length > 0);
  if (populated.length === 0) return null;

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <header className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CalendarRange className="size-3 text-[color:var(--neon)]" />
          לוח חיובים · {HORIZON} ימים
        </span>
        <span className="text-[10px] text-muted-foreground/80">
          {populated.length} ימים פעילים
        </span>
      </header>

      <ul className="flex flex-col gap-2">
        {populated.map((d, idx) => (
          <motion.li
            key={d.date.toISOString()}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: Math.min(idx, 6) * STAGGER_TIGHT,
              duration: 0.25,
              ease: EASE_OUT_EXPO,
            }}
            className="rounded-2xl border border-white/8 bg-black/25 p-3"
          >
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-foreground">
                {DAY_FMT.format(d.date)}
              </span>
              <div
                className="flex items-center gap-2 text-[10.5px]"
                dir="ltr"
                data-mono="true"
              >
                {d.outflow > 0 ? (
                  <span className="flex items-center gap-0.5 text-destructive">
                    <ArrowDownRight className="size-3" />
                    {ILS.format(d.outflow)}
                  </span>
                ) : null}
                {d.income > 0 ? (
                  <span className="flex items-center gap-0.5 text-[#34D399]">
                    <ArrowUpRight className="size-3" />
                    {ILS.format(d.income)}
                  </span>
                ) : null}
              </div>
            </div>
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {d.items.map((it) => (
                <li
                  key={`${it.sourceId}-${it.date.toISOString()}`}
                  className="flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground"
                >
                  <span className="truncate">
                    <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-[9px] text-foreground/85">
                      {KIND_LABEL[it.kind] ?? it.kind}
                    </span>
                    <span className="ms-1.5 text-foreground">{it.label}</span>
                  </span>
                  <span
                    data-mono="true"
                    dir="ltr"
                    style={{
                      color:
                        it.kind === "income"
                          ? "#34D399"
                          : it.status === "paid"
                            ? "#A1A1AA"
                            : undefined,
                    }}
                  >
                    {it.kind === "income"
                      ? `+${ILS.format(-it.amount)}`
                      : ILS.format(it.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
