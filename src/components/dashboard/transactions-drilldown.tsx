"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Ban,
  CalendarDays,
  CreditCard,
  Pencil,
  Trash2,
} from "lucide-react";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useFinanceStore } from "@/lib/store";
import { getCategory, type CategoryId } from "@/lib/categories";
import { currentMonthKey } from "@/lib/dates";
import { sliceForMonth } from "@/lib/projections";
import type { ExpenseEntry } from "@/types/finance";

type FilterKind = "actual-this-month" | "budgeted-this-month" | "all-this-month";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  filter: FilterKind;
  /** Optional narrowing — only show entries in this category. */
  categoryFilter?: CategoryId;
};

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const TIME_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function sourceLabel(e: ExpenseEntry): string {
  if (e.source === "auto") return "אוטומטי";
  if (e.source === "sms") return "SMS";
  if (e.source === "wallet") return "Wallet";
  if (e.source === "manual") return "ידני";
  return e.source ?? "—";
}

export function TransactionsDrilldown({
  open,
  onOpenChange,
  title,
  subtitle,
  filter,
  categoryFilter,
}: Props) {
  const entries = useFinanceStore((s) => s.entries);
  const deleteExpense = useFinanceStore((s) => s.deleteExpense);

  const monthKey = currentMonthKey();

  const rows = useMemo(() => {
    const now = new Date();
    const out: Array<{
      entry: ExpenseEntry;
      sliceAmount: number;
      chargeDate: Date;
    }> = [];
    for (const e of entries) {
      if (e.needsConfirmation) continue;
      if (e.bankPending) continue;
      if (categoryFilter && e.category !== categoryFilter) continue;
      const slice = sliceForMonth(e, monthKey);
      if (!slice) continue;

      if (filter === "actual-this-month") {
        if (slice.chargeDate.getTime() > now.getTime()) continue;
        if (e.isRefund) continue;
      } else if (filter === "budgeted-this-month") {
        if (slice.chargeDate.getTime() > now.getTime()) continue;
        if (e.isRefund) continue;
        if (e.excludeFromBudget) continue;
      }
      // "all-this-month" — every slice landing in this month, past or future.

      out.push({
        entry: e,
        sliceAmount: slice.amount,
        chargeDate: slice.chargeDate,
      });
    }
    return out.sort(
      (a, b) => b.chargeDate.getTime() - a.chargeDate.getTime(),
    );
  }, [entries, monthKey, filter, categoryFilter]);

  const total = rows.reduce((sum, r) => sum + r.sliceAmount, 0);

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={title}>
      <header className="flex items-baseline justify-between gap-3 pb-1">
        <div className="flex flex-col text-right">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {subtitle ? (
            <span className="text-[11px] text-muted-foreground">
              {subtitle}
            </span>
          ) : null}
        </div>
        <div
          dir="ltr"
          className="font-mono text-2xl font-light text-foreground"
        >
          {ILS.format(total)}
        </div>
      </header>

      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        <span>{rows.length} עסקאות</span>
        <span>{monthKey}</span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center text-[12px] text-muted-foreground">
          אין עסקאות תואמות לחודש הזה.
        </div>
      ) : (
        <ul className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto pb-1">
          {rows.map(({ entry, sliceAmount, chargeDate }) => {
            const cat = getCategory(entry.category as CategoryId);
            return (
              <motion.li
                key={entry.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2.5 rounded-2xl border border-white/8 bg-background/40 p-2.5"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{
                    background: `${cat.accent}22`,
                    color: cat.accent,
                  }}
                >
                  <cat.icon className="size-4" strokeWidth={1.6} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-medium text-foreground">
                      {entry.merchant ?? entry.note ?? cat.label}
                    </span>
                    {entry.excludeFromBudget ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-1.5 py-0.5 text-[9px] font-medium text-gold"
                        title="לא נכלל בתקציב"
                      >
                        <Ban className="size-2.5" />
                        חוץ-תקציב
                      </span>
                    ) : null}
                    {entry.isRefund ? (
                      <span className="rounded-full bg-[#34D399]/15 px-1.5 py-0.5 text-[9px] font-medium text-[#34D399]">
                        זיכוי
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-0.5">
                      <CalendarDays className="size-2.5" />
                      {TIME_FMT.format(chargeDate)}
                    </span>
                    <span className="inline-flex items-center gap-0.5">
                      <CreditCard className="size-2.5" />
                      {entry.paymentMethod === "credit" ? "אשראי" : "מזומן"}
                    </span>
                    <span>{sourceLabel(entry)}</span>
                    {entry.installments > 1 ? (
                      <span>· {entry.installments}× תשלומים</span>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <span
                    data-mono="true"
                    dir="ltr"
                    className="text-[13px] font-medium text-foreground"
                  >
                    {ILS.format(sliceAmount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("למחוק את ההוצאה?")) deleteExpense(entry.id);
                    }}
                    className="text-muted-foreground transition-colors hover:text-destructive"
                    aria-label="מחק"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}

      <p className="px-1 pt-1 text-[10px] text-muted-foreground">
        <Pencil className="me-1 inline size-2.5" />
        עריכה מלאה דרך ה-PendingTray או טופס ההוצאות.
      </p>
    </BottomSheet>
  );
}
