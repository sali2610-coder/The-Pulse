"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { monthOverMonthTotals } from "@/lib/forecast";

const formatILS = (value: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value);

export function MonthOverMonth() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const months = useMemo(() => {
    if (!hydrated) return [];
    return monthOverMonthTotals({
      entries,
      monthKey: currentMonthKey(),
      count: 6,
    });
  }, [hydrated, entries]);

  const max = Math.max(1, ...months.map((m) => m.total));
  const allZero = months.every((m) => m.total === 0);

  return (
    <section className="rounded-2xl border border-border/60 bg-surface/50 p-5 backdrop-blur-md">
      <header className="mb-4">
        <div className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          חודש מול חודש
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          6 חודשים אחרונים
        </div>
      </header>

      {allZero ? (
        <p className="rounded-xl border border-dashed border-border/50 px-4 py-8 text-center text-xs text-muted-foreground">
          אין עדיין נתונים היסטוריים. ייבא דף חיוב מהאזור האישי שלך כדי
          לראות מגמות.
        </p>
      ) : (
        <div className="flex h-40 items-end justify-between gap-2">
          {months.map((m, idx) => {
            const heightPct = max > 0 ? (m.total / max) * 100 : 0;
            const isCurrent = idx === months.length - 1;
            return (
              <div
                key={m.monthKey}
                className="flex flex-1 flex-col items-center gap-1.5"
              >
                <span
                  data-mono="true"
                  className="text-[10px] text-muted-foreground"
                  style={{ direction: "ltr" }}
                >
                  {formatILS(m.total)}
                </span>
                <div className="relative flex h-32 w-full items-end justify-center">
                  <motion.div
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: heightPct / 100 }}
                    transition={{
                      type: "spring",
                      stiffness: 80,
                      damping: 18,
                      delay: idx * 0.05,
                    }}
                    className="w-full origin-bottom rounded-t-md"
                    style={{
                      height: "100%",
                      background: isCurrent
                        ? "linear-gradient(180deg, #00E5FF, color-mix(in oklab, #00E5FF 50%, transparent))"
                        : "linear-gradient(180deg, rgba(212,175,55,0.7), rgba(212,175,55,0.15))",
                      boxShadow: isCurrent
                        ? "0 0 18px -2px rgba(0,229,255,0.5)"
                        : undefined,
                    }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {m.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
