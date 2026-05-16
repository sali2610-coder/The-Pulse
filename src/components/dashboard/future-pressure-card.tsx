"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { CalendarRange } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { futureMonthlyPressure } from "@/lib/forecast";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const MONTH_LABEL = new Intl.DateTimeFormat("he-IL", {
  month: "short",
});

function monthKeyToDate(monthKey: string): Date {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

export function FuturePressureCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const loans = useFinanceStore((s) => s.loans);

  const months = useMemo(() => {
    if (!hydrated) return [];
    return futureMonthlyPressure({
      entries,
      rules,
      statuses,
      loans,
      monthKey: currentMonthKey(),
      months: 3,
    });
  }, [hydrated, entries, rules, statuses, loans]);

  if (!hydrated) return null;
  const allEmpty = months.every((m) => m.total === 0);
  if (allEmpty) return null;

  const maxTotal = Math.max(1, ...months.map((m) => m.total));

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18, duration: 0.4 }}
      className="glass-card flex flex-col gap-3 rounded-3xl p-5"
    >
      <header className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[color:var(--neon)]/12 text-[color:var(--neon)]">
            <CalendarRange className="h-5 w-5" strokeWidth={1.6} />
          </span>
          <div className="flex flex-col">
            <span className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              לחץ עתידי · 3 חודשים
            </span>
            <span className="text-base font-semibold text-foreground">
              סך התחייבויות צפויות
            </span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3">
        {months.map((m, idx) => {
          const installmentPct = m.total > 0 ? (m.installmentSlices / m.total) * 100 : 0;
          const recurringPct = m.total > 0 ? (m.recurring / m.total) * 100 : 0;
          const loansPct = m.total > 0 ? (m.loans / m.total) * 100 : 0;
          const heightFraction = m.total / maxTotal;
          return (
            <motion.div
              key={m.monthKey}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.22 + idx * 0.06 }}
              className="flex flex-col items-stretch gap-1.5"
            >
              <span className="text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {MONTH_LABEL.format(monthKeyToDate(m.monthKey))}
              </span>
              <div className="relative h-32 overflow-hidden rounded-2xl border border-white/8 bg-surface/40">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{
                    height: `${Math.max(4, heightFraction * 100)}%`,
                  }}
                  transition={{
                    delay: 0.3 + idx * 0.06,
                    type: "spring",
                    stiffness: 90,
                    damping: 18,
                  }}
                  className="absolute bottom-0 left-0 right-0 flex flex-col-reverse"
                >
                  <div
                    className="w-full"
                    style={{
                      height: `${installmentPct}%`,
                      background: "linear-gradient(180deg, #00E5FF 0%, #00B8D4 100%)",
                    }}
                  />
                  <div
                    className="w-full"
                    style={{
                      height: `${recurringPct}%`,
                      background: "linear-gradient(180deg, #D4AF37 0%, #B8911C 100%)",
                    }}
                  />
                  <div
                    className="w-full"
                    style={{
                      height: `${loansPct}%`,
                      background: "linear-gradient(180deg, #A78BFA 0%, #7C5FD9 100%)",
                    }}
                  />
                </motion.div>
              </div>
              <span
                dir="ltr"
                data-mono="true"
                className="text-center text-xs font-semibold text-foreground"
              >
                {ILS.format(m.total)}
              </span>
            </motion.div>
          );
        })}
      </div>

      <ul className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-muted-foreground">
        <LegendChip color="#00E5FF" label="תשלומים" />
        <LegendChip color="#D4AF37" label="קבועות" />
        <LegendChip color="#A78BFA" label="הלוואות" />
      </ul>
    </motion.section>
  );
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}
