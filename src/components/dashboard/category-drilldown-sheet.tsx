"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useFinanceStore } from "@/lib/store";
import { sliceForMonth } from "@/lib/projections";
import { getCategory, type CategoryId } from "@/lib/categories";
import type { MonthKey } from "@/types/finance";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 2,
});
const DATE_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
});

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: CategoryId;
  monthKey: MonthKey;
};

export function CategoryDrilldownSheet({
  open,
  onOpenChange,
  category,
  monthKey,
}: Props) {
  const entries = useFinanceStore((s) => s.entries);
  const meta = getCategory(category);

  const rows = useMemo(() => {
    type Row = {
      id: string;
      merchant: string;
      sliceAmount: number;
      chargeDate: Date;
      installments: number;
      source: string;
    };
    const list: Row[] = [];
    for (const entry of entries) {
      if (entry.category !== category) continue;
      if (entry.needsConfirmation) continue;
      if (entry.bankPending) continue;
      const slice = sliceForMonth(entry, monthKey);
      if (!slice) continue;
      list.push({
        id: entry.id,
        merchant: entry.merchant?.trim() || "עסק לא ידוע",
        sliceAmount: slice.amount,
        chargeDate: slice.chargeDate,
        installments: entry.installments,
        source: entry.source,
      });
    }
    list.sort((a, b) => b.chargeDate.getTime() - a.chargeDate.getTime());
    return list;
  }, [entries, category, monthKey]);

  const total = rows.reduce((a, b) => a + b.sliceAmount, 0);

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`${meta.label} — פירוט החודש`}
    >
      <header className="flex items-center gap-3 pt-1">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: `${meta.accent}22`, color: meta.accent }}
        >
          <meta.icon className="h-6 w-6" strokeWidth={1.6} />
        </span>
        <div className="flex flex-1 flex-col">
          <span className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
            פירוט קטגוריה
          </span>
          <h2 className="text-lg font-semibold text-foreground">
            {meta.label}
          </h2>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            סך הכל
          </span>
          <span
            dir="ltr"
            className="font-mono text-lg font-semibold text-foreground"
          >
            {ILS.format(total)}
          </span>
        </div>
      </header>

      <ul className="flex flex-col gap-1.5">
        <AnimatePresence initial={false}>
          {rows.map((row, idx) => (
            <motion.li
              key={row.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ delay: idx * 0.015 }}
              className="flex items-center gap-3 rounded-2xl border border-white/8 bg-surface/50 p-3"
            >
              <div className="flex flex-1 flex-col gap-0.5">
                <span className="line-clamp-1 text-sm font-medium text-foreground">
                  {row.merchant}
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span>{DATE_FMT.format(row.chargeDate)}</span>
                  {row.installments > 1 && (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <span>
                        תשלום {row.installments > 1 ? `1/${row.installments}` : ""}
                      </span>
                    </>
                  )}
                  {row.source === "wallet" && (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <span>Wallet</span>
                    </>
                  )}
                </span>
              </div>
              <span
                dir="ltr"
                className="font-mono text-sm font-semibold text-foreground"
              >
                {ILS.format(row.sliceAmount)}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
        {rows.length === 0 && (
          <li className="rounded-2xl border border-white/8 bg-surface/40 p-4 text-center text-sm text-muted-foreground">
            עדיין אין חיובים בקטגוריה הזו החודש.
          </li>
        )}
      </ul>
    </BottomSheet>
  );
}
