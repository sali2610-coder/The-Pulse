"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Banknote, BadgeCheck, CalendarCheck2 } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { summarizeLoans } from "@/lib/loan-summary";
import { currentMonthKey, monthIndex } from "@/lib/dates";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const HEBREW_MONTH = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

function formatMonthKey(monthKey?: string): string {
  if (!monthKey) return "—";
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  return `${HEBREW_MONTH[m - 1]} ${y}`;
}

/**
 * Aggregate active-loan picture. Renders nothing when the user has
 * no active loans. Shows total monthly burden, total remaining
 * principal, projected debt-free month, and a chip when one or
 * more loans is wrapping up within 3 months.
 */
export function LoanSummaryCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const loans = useFinanceStore((s) => s.loans);

  const summary = useMemo(() => {
    if (!hydrated) return null;
    return summarizeLoans({ loans, monthKey: currentMonthKey() });
  }, [hydrated, loans]);

  if (!hydrated || !summary) return null;
  if (summary.activeCount === 0) return null;

  const monthsToDebtFree =
    summary.debtFreeMonthKey !== undefined
      ? monthIndex(summary.debtFreeMonthKey) -
        monthIndex(currentMonthKey())
      : undefined;

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card flex flex-col gap-3 rounded-3xl p-4"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-[#A78BFA]/15 text-[#A78BFA]">
            <Banknote className="size-4" strokeWidth={1.8} />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              עומס הלוואות
            </span>
            <span className="text-[11.5px] text-muted-foreground">
              {summary.activeCount === 1
                ? "הלוואה פעילה אחת"
                : `${summary.activeCount} הלוואות פעילות`}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5 leading-tight">
          <span
            data-mono="true"
            dir="ltr"
            className="text-[15px] font-semibold text-destructive"
          >
            −{ILS.format(summary.totalMonthly)} / חודש
          </span>
          {summary.completedSoonCount > 0 ? (
            <span
              className="flex items-center gap-1 rounded-full bg-[#34D399]/15 px-1.5 py-0.5 text-[9px] font-semibold text-[#34D399]"
              dir="rtl"
            >
              <BadgeCheck className="size-3" />
              נסגרים בקרוב · {summary.completedSoonCount}
            </span>
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <Tile
          label="נותר לתשלום"
          value={ILS.format(summary.totalRemaining)}
          tone="#F87171"
        />
        <Tile
          label="חופשי מחוב"
          value={
            summary.debtFreeMonthKey
              ? formatMonthKey(summary.debtFreeMonthKey)
              : "—"
          }
          tone="#34D399"
          ltr={false}
        />
      </div>

      {monthsToDebtFree !== undefined && monthsToDebtFree > 0 ? (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <CalendarCheck2 className="size-3 text-[#34D399]" />
          <span>
            עוד {monthsToDebtFree} חודשים עד שתפסיק לשלם הלוואות
          </span>
        </div>
      ) : null}
    </motion.section>
  );
}

function Tile({
  label,
  value,
  tone,
  ltr = true,
}: {
  label: string;
  value: string;
  tone: string;
  ltr?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl border border-white/6 bg-background/30 p-2.5">
      <span className="text-[9.5px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      <span
        data-mono="true"
        dir={ltr ? "ltr" : "rtl"}
        className="text-[13px] font-semibold"
        style={{ color: tone }}
      >
        {value}
      </span>
    </div>
  );
}
