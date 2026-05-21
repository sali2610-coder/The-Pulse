"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, TrendingUp } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { detectSpendAnomalies } from "@/lib/spend-anomalies";
import { currentMonthKey } from "@/lib/dates";
import { getCategory } from "@/lib/categories";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const TONES = {
  alert: {
    border: "border-[#F87171]/40",
    bg: "bg-[#F87171]/8",
    fg: "#F87171",
    Icon: AlertTriangle,
    label: "חריגה משמעותית",
  },
  watch: {
    border: "border-[#D4AF37]/40",
    bg: "bg-[#D4AF37]/8",
    fg: "#D4AF37",
    Icon: TrendingUp,
    label: "מגמת עלייה",
  },
} as const;

/**
 * Surfaces categories spending materially more this month vs the
 * user's 3-month baseline. Renders nothing when there are no
 * anomalies. Read-only — uses `detectSpendAnomalies` over the
 * Zustand entries selector.
 */
export function AnomalyBanner() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const anomalies = useMemo(() => {
    if (!hydrated) return [];
    return detectSpendAnomalies({
      entries,
      monthKey: currentMonthKey(),
    });
  }, [hydrated, entries]);

  if (!hydrated) return null;
  if (anomalies.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <AnimatePresence initial={false}>
        {anomalies.slice(0, 3).map((a) => {
          const cat = getCategory(a.category);
          const tone = TONES[a.severity];
          const Icon = tone.Icon;
          const ratioLabel = `${a.ratio.toFixed(1)}×`;
          return (
            <motion.div
              key={a.category}
              layout
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 8 }}
              className={`flex items-center gap-2.5 rounded-2xl border p-3 ${tone.border} ${tone.bg}`}
            >
              <div
                className="flex size-9 shrink-0 items-center justify-center rounded-xl"
                style={{ background: `${tone.fg}22`, color: tone.fg }}
              >
                <Icon className="size-4" strokeWidth={1.8} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[10px] uppercase tracking-[0.2em]"
                    style={{ color: tone.fg }}
                  >
                    {tone.label}
                  </span>
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                    style={{ background: `${tone.fg}22`, color: tone.fg }}
                    dir="ltr"
                  >
                    {ratioLabel}
                  </span>
                </div>
                <div className="text-[12.5px] font-medium text-foreground">
                  {cat.label} — {ILS.format(a.thisMonth)} החודש מול ממוצע{" "}
                  {ILS.format(a.priorAverage)}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </section>
  );
}
