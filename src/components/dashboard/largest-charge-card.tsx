"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, Trophy } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { findLargestCharge } from "@/lib/largest-charge";
import { currentMonthKey } from "@/lib/dates";
import { getCategory, type CategoryId } from "@/lib/categories";
import { ExpenseEditSheet } from "@/components/dashboard/expense-edit-sheet";
import { tap } from "@/lib/haptics";
import type { ExpenseEntry } from "@/types/finance";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

/**
 * Spotlight on the single biggest charge of the month. One-glance
 * answer to "where did the money go?". Tap opens the edit sheet
 * inline so the user can correct / reclassify in two taps. Hidden
 * when there's no qualifying entry this month.
 */
export function LargestChargeCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const largest = useMemo(() => {
    if (!hydrated) return null;
    return findLargestCharge({ entries, monthKey: currentMonthKey() });
  }, [hydrated, entries]);

  const [editEntry, setEditEntry] = useState<ExpenseEntry | null>(null);

  if (!hydrated || !largest) return null;
  const cat = getCategory(largest.category as CategoryId);
  const Icon = cat.icon;

  function openEdit() {
    if (!largest) return;
    const entry = entries.find((e) => e.id === largest.entryId);
    if (!entry) return;
    tap();
    setEditEntry(entry);
  }

  return (
    <>
      <motion.section
        layout
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        role="button"
        tabIndex={0}
        onClick={openEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openEdit();
          }
        }}
        whileTap={{ scale: 0.99 }}
        className="glass-card flex cursor-pointer items-center gap-3 rounded-3xl p-4 outline-none transition-colors hover:border-white/14 focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60"
      >
        <span className="flex size-11 items-center justify-center rounded-2xl bg-gold/15 text-gold">
          <Trophy className="size-5" strokeWidth={1.8} />
        </span>
        <div className="flex flex-1 flex-col leading-tight">
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            החיוב הגדול החודש
          </span>
          <span className="flex items-center gap-1.5 text-[14px] font-medium text-foreground">
            <span
              className="flex size-5 items-center justify-center rounded-md"
              style={{ background: `${cat.accent}22`, color: cat.accent }}
            >
              <Icon className="size-3" strokeWidth={1.7} />
            </span>
            <span className="truncate">
              {largest.merchant ?? cat.label}
            </span>
            {largest.installments > 1 ? (
              <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                {largest.installments}× תשלומים
              </span>
            ) : null}
          </span>
          <span
            className="text-[10.5px] text-muted-foreground"
            dir="ltr"
          >
            {DAY_FMT.format(largest.chargeDate)} · {cat.label}
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 leading-tight">
          <span
            data-mono="true"
            dir="ltr"
            className="text-[16px] font-semibold text-destructive"
          >
            −{ILS.format(largest.amount)}
          </span>
          <ChevronLeft className="size-3 text-muted-foreground" />
        </div>
      </motion.section>

      <ExpenseEditSheet
        key={editEntry?.id ?? "none"}
        open={editEntry !== null}
        onOpenChange={(o) => {
          if (!o) setEditEntry(null);
        }}
        entry={editEntry}
      />
    </>
  );
}
