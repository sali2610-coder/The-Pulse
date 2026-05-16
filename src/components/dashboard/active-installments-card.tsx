"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Layers } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { installmentProgress } from "@/lib/projections";
import { getCategory } from "@/lib/categories";
import { tap } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const MONTH_FMT = new Intl.DateTimeFormat("he-IL", {
  month: "short",
  year: "numeric",
});

type Row = {
  id: string;
  merchant: string;
  category: ReturnType<typeof getCategory>;
  total: number;
  paid: number;
  remaining: number;
  paidAmount: number;
  remainingAmount: number;
  monthlySlice: number;
  nextChargeDate?: Date;
  finalChargeDate: Date;
};

export function ActiveInstallmentsCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const [expanded, setExpanded] = useState(false);

  const rows = useMemo<Row[]>(() => {
    if (!hydrated) return [];
    const now = new Date();
    const out: Row[] = [];
    for (const entry of entries) {
      if (entry.installments < 2) continue;
      if (entry.isRefund) continue;
      const progress = installmentProgress(entry, now);
      if (progress.isComplete) continue;
      const monthlySlice =
        progress.total > 0 ? entry.amount / progress.total : entry.amount;
      // Compute the final installment chargeDate for display.
      const start = new Date(entry.chargeDate);
      const finalMonth0 = start.getMonth() + progress.total - 1;
      const finalY = start.getFullYear() + Math.floor(finalMonth0 / 12);
      const finalM0 = ((finalMonth0 % 12) + 12) % 12;
      const lastDay = new Date(finalY, finalM0 + 1, 0).getDate();
      const finalDay = Math.min(start.getDate(), lastDay);
      const finalChargeDate = new Date(finalY, finalM0, finalDay);
      out.push({
        id: entry.id,
        merchant: entry.merchant?.trim() || "תשלום",
        category: getCategory(entry.category),
        total: progress.total,
        paid: progress.paid,
        remaining: progress.remaining,
        paidAmount: progress.paidAmount,
        remainingAmount: progress.remainingAmount,
        monthlySlice,
        nextChargeDate: progress.nextChargeDate,
        finalChargeDate,
      });
    }
    // Largest remaining commitment first.
    out.sort((a, b) => b.remainingAmount - a.remainingAmount);
    return out;
  }, [hydrated, entries]);

  if (!hydrated || rows.length === 0) return null;

  const totalRemaining = rows.reduce((sum, r) => sum + r.remainingAmount, 0);
  const totalMonthly = rows.reduce((sum, r) => sum + r.monthlySlice, 0);
  const visibleRows = expanded ? rows : rows.slice(0, 3);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.14, duration: 0.4 }}
      className="glass-card flex flex-col gap-3 rounded-3xl p-5"
    >
      <header className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[color:var(--gold)]/15 text-[color:var(--gold)]">
            <Layers className="h-5 w-5" strokeWidth={1.6} />
          </span>
          <div className="flex flex-col">
            <span className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              תשלומים פעילים
            </span>
            <span className="text-base font-semibold text-foreground">
              {rows.length === 1
                ? "תוכנית תשלומים אחת"
                : `${rows.length} תוכניות תשלומים`}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-0">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            סה״כ חודשי
          </span>
          <span
            dir="ltr"
            data-mono="true"
            className="text-base font-semibold text-foreground"
          >
            {ILS.format(totalMonthly)}
          </span>
          <span dir="ltr" className="text-[10px] text-muted-foreground">
            צפי נותר {ILS.format(totalRemaining)}
          </span>
        </div>
      </header>

      <ul className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {visibleRows.map((row, idx) => {
            const pct = Math.round((row.paid / row.total) * 100);
            const Icon = row.category.icon;
            return (
              <motion.li
                key={row.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ delay: idx * 0.03 }}
                className="rounded-2xl border border-white/8 bg-surface/50 p-3"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-xl"
                    style={{
                      background: `${row.category.accent}1f`,
                      color: row.category.accent,
                    }}
                  >
                    <Icon className="h-5 w-5" strokeWidth={1.6} />
                  </span>
                  <div className="flex flex-1 flex-col gap-0.5">
                    <span className="line-clamp-1 text-sm font-medium text-foreground">
                      {row.merchant}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {row.paid}/{row.total} · עד{" "}
                      {MONTH_FMT.format(row.finalChargeDate)}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-0">
                    <span
                      dir="ltr"
                      data-mono="true"
                      className="text-sm font-semibold text-foreground"
                    >
                      {ILS.format(row.monthlySlice)}
                    </span>
                    <span dir="ltr" className="text-[10px] text-muted-foreground">
                      נותר {ILS.format(row.remainingAmount)}
                    </span>
                  </div>
                </div>
                <div className="relative mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ delay: 0.2 + idx * 0.04, duration: 0.6 }}
                    className="h-full rounded-full"
                    style={{
                      background: `linear-gradient(90deg, ${row.category.accent}, ${row.category.accent}66)`,
                    }}
                  />
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      {rows.length > 3 && (
        <button
          type="button"
          onClick={() => {
            tap();
            setExpanded((v) => !v);
          }}
          className="flex w-full items-center justify-center gap-1 rounded-xl border border-white/8 bg-surface/40 py-2 text-[11px] text-muted-foreground transition-colors hover:bg-surface/60"
        >
          {expanded ? "הצג פחות" : `הצג עוד ${rows.length - 3}`}
          <ChevronDown
            className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
            strokeWidth={2}
          />
        </button>
      )}
    </motion.section>
  );
}
