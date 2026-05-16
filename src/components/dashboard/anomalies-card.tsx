"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertOctagon, TrendingUp } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { detectAnomalies } from "@/lib/anomalies";
import { currentMonthKey } from "@/lib/dates";
import { getCategory } from "@/lib/categories";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const DATE_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
});

export function AnomaliesCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const anomalies = useMemo(() => {
    if (!hydrated) return [];
    return detectAnomalies({ entries, monthKey: currentMonthKey() }).slice(0, 4);
  }, [hydrated, entries]);

  if (!hydrated || anomalies.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.4 }}
      className="glass-card flex flex-col gap-3 rounded-3xl p-5"
      style={{
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.06), 0 24px 60px -40px rgba(248,113,113,0.4)",
      }}
    >
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F87171]/15 text-[#F87171]">
          <AlertOctagon className="h-5 w-5" strokeWidth={1.6} />
        </span>
        <div className="flex flex-col">
          <span className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            חיובים חריגים
          </span>
          <span className="text-base font-semibold text-foreground">
            {anomalies.length === 1
              ? "1 חיוב מעל הרגיל"
              : `${anomalies.length} חיובים מעל הרגיל`}
          </span>
        </div>
      </header>

      <ul className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {anomalies.map((a, idx) => {
            const meta = getCategory(a.category);
            const Icon = meta.icon;
            return (
              <motion.li
                key={a.entryId}
                layout
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ delay: idx * 0.04 }}
                className="flex items-center gap-3 rounded-2xl border border-[#F87171]/15 bg-surface/50 p-3"
              >
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{
                    background: `${meta.accent}1f`,
                    color: meta.accent,
                  }}
                >
                  <Icon className="h-5 w-5" strokeWidth={1.6} />
                </span>
                <div className="flex flex-1 flex-col gap-0.5">
                  <span className="line-clamp-1 text-sm font-medium text-foreground">
                    {a.merchant}
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span>{DATE_FMT.format(new Date(a.chargeDate))}</span>
                    <span className="text-muted-foreground/40">·</span>
                    <span dir="ltr">ממוצע {ILS.format(a.baseline)}</span>
                  </span>
                </div>
                <div className="flex flex-col items-end">
                  <span
                    dir="ltr"
                    data-mono="true"
                    className="text-sm font-semibold text-[#F87171]"
                  >
                    {ILS.format(a.amount)}
                  </span>
                  <span className="flex items-center gap-0.5 text-[10px] font-medium text-[#F87171]">
                    <TrendingUp className="h-2.5 w-2.5" strokeWidth={2.5} />
                    {a.factor.toFixed(1)}×
                  </span>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      <p className="text-[10px] text-muted-foreground">
        מתבסס על ממוצע 6 החודשים האחרונים אצל אותו עסק.
      </p>
    </motion.section>
  );
}
