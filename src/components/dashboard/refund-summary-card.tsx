"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Undo2 } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { summarizeRefunds } from "@/lib/refund-summary";
import { currentMonthKey } from "@/lib/dates";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
});

/**
 * Surfaces refund / credit-back totals for the current month. Refunds
 * are already netted out of budget math; this card just makes the
 * positive flow visible — useful for reconciling returns + travel
 * adjustments. Hidden when nothing came back this month.
 */
export function RefundSummaryCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const summary = useMemo(() => {
    if (!hydrated) return null;
    return summarizeRefunds({ entries, monthKey: currentMonthKey() });
  }, [hydrated, entries]);

  if (!hydrated || !summary) return null;
  if (summary.count === 0) return null;

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card flex flex-col gap-3 rounded-3xl p-4"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-[#34D399]/15 text-[#34D399]">
            <Undo2 className="size-4" strokeWidth={1.8} />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              זיכויים החודש
            </span>
            <span className="text-[11.5px] text-muted-foreground">
              חוזרים נטו מנוקים מהתקציב
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end leading-tight">
          <span
            data-mono="true"
            dir="ltr"
            className="text-[17px] font-semibold text-[#34D399]"
          >
            +{ILS.format(summary.total)}
          </span>
          <span className="text-[9px] text-muted-foreground">
            {summary.count} זיכויים
          </span>
        </div>
      </header>

      <ul className="flex flex-col gap-1.5">
        {summary.topRefunds.map((r) => (
          <li
            key={r.entryId}
            className="flex items-center justify-between gap-2 rounded-2xl border border-white/6 bg-black/25 px-3 py-1.5"
          >
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[12px] text-foreground">
                {r.merchant ?? "זיכוי"}
              </span>
              <span
                className="text-[10px] text-muted-foreground"
                dir="ltr"
              >
                {DAY_FMT.format(r.chargeDate)}
              </span>
            </div>
            <span
              data-mono="true"
              dir="ltr"
              className="text-[13px] font-semibold text-[#34D399]"
            >
              +{ILS.format(r.amount)}
            </span>
          </li>
        ))}
      </ul>
    </motion.section>
  );
}
