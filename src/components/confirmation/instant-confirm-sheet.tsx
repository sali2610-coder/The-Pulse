"use client";

// Wallet-first single-tap confirmation sheet.
//
// Primary surface for Phase 205: when a pending transaction lands
// (Wallet push, SMS, manual), the user sees a giant amount + merchant
// + AUTO-SUGGESTED category (high-confidence-coloured) and approves
// with ONE tap. No form. No long flow.
//
// Optimistic UI: confirmExpense runs immediately. The pending tray
// re-renders without the row before the sheet finishes its exit
// animation. A failure would be surfaced via toast; today's store
// action is synchronous so it never fails.
//
// Existing ConfirmationSheet stays for the "edit deeply" path —
// this sheet is the express lane.

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Check,
  Pencil,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useFinanceStore } from "@/lib/store";
import { getCategory, type CategoryId, CATEGORIES } from "@/lib/categories";
import { suggestCategory } from "@/lib/suggest-category";
import { listCorrections, recordCorrection } from "@/lib/corrections";
import {
  InsightChip,
  type InsightSeverity,
} from "@/components/ui/insight-chip";
import { Pill } from "@/components/ui/pill";
import { success, tap } from "@/lib/haptics";
import { SPRING_BOUNCE, CARD_TAP } from "@/lib/motion-tokens";
import type { ExpenseEntry } from "@/types/finance";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const CONFIDENCE_SEV: Record<string, InsightSeverity> = {
  high: "info",
  medium: "watch",
  low: "warn",
};

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "ביטחון גבוה",
  medium: "ביטחון בינוני",
  low: "ביטחון נמוך",
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: ExpenseEntry | null;
};

export function InstantConfirmSheet({ open, onOpenChange, entry }: Props) {
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const confirmExpense = useFinanceStore((s) => s.confirmExpense);
  const dismissPending = useFinanceStore((s) => s.dismissPending);

  const suggestion = useMemo(() => {
    if (!entry) return null;
    return suggestCategory({
      merchant: entry.merchant,
      amount: entry.amount,
      cardLast4: entry.cardLast4,
      entries,
      rules,
      // Phase 215 — feed user-recorded corrections back into the
      // engine so 3 manual overrides for a merchant can flip the
      // suggestion to HIGH confidence on its own.
      corrections: listCorrections(),
    });
  }, [entry, entries, rules]);

  const [override, setOverride] = useState<CategoryId | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (!entry || !suggestion) {
    return (
      <BottomSheet open={open} onOpenChange={onOpenChange}>
        <p className="text-center text-[12px] text-muted-foreground">
          לא נמצאה עסקה.
        </p>
      </BottomSheet>
    );
  }

  const activeCategory: CategoryId = override ?? suggestion.category;
  const cat = getCategory(activeCategory);
  const Icon = cat.icon;

  const onApprove = () => {
    if (confirming) return;
    setConfirming(true);
    // Phase 215 — if the user overrode the suggested category,
    // record a correction so the next suggestion biases toward
    // their choice. Same-category approvals don't record (they
    // already match the engine's vote).
    if (override && override !== suggestion.category) {
      recordCorrection({
        targetId: entry.id,
        targetKind: "entry",
        kind: "wrong_category",
        suggestedCategory: activeCategory,
      });
    }
    // Optimistic: confirmExpense is synchronous against the local
    // store; downstream cloud sync replays the update.
    confirmExpense(entry.id, { category: activeCategory });
    success();
    toast.success(`אושר · ${ILS.format(entry.amount)}`);
    onOpenChange(false);
    // Reset internal state so the next entry opens fresh.
    setTimeout(() => {
      setOverride(null);
      setConfirming(false);
    }, 300);
  };

  const onReject = () => {
    dismissPending(entry.id);
    tap();
    toast.message("נדחה");
    onOpenChange(false);
    setTimeout(() => {
      setOverride(null);
      setConfirming(false);
    }, 300);
  };

  return (
    <>
      <BottomSheet
        open={open}
        onOpenChange={onOpenChange}
        title={entry.merchant ?? "חיוב חדש"}
      >
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING_BOUNCE}
          className="flex flex-col gap-3"
        >
          {/* Big-glance amount + merchant. */}
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex min-w-0 flex-col gap-0.5 leading-tight">
              <span className="truncate text-[18px] font-medium text-foreground">
                {entry.merchant ?? "חיוב חדש"}
              </span>
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                {entry.cardLast4 ? (
                  <Pill>····{entry.cardLast4}</Pill>
                ) : null}
                <span dir="ltr">
                  {new Intl.DateTimeFormat("he-IL", {
                    weekday: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(entry.chargeDate))}
                </span>
              </div>
            </div>
            <motion.span
              key={entry.amount}
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={SPRING_BOUNCE}
              data-mono="true"
              dir="ltr"
              className="text-[34px] font-light leading-none text-foreground"
            >
              {ILS.format(entry.amount)}
            </motion.span>
          </div>

          {/* Suggested category chip — tap to override. */}
          <motion.button
            type="button"
            whileTap={CARD_TAP}
            onClick={() => setPickerOpen(true)}
            aria-label={`קטגוריה: ${cat.label}. הקש להחלפה.`}
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/30 p-3 outline-none transition-colors hover:border-white/20 focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60"
          >
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-2xl"
              style={{ background: `${cat.accent}22`, color: cat.accent }}
            >
              <Icon className="size-5" strokeWidth={1.8} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="text-[14px] font-medium text-foreground">
                  {cat.label}
                </span>
                <InsightChip
                  severity={CONFIDENCE_SEV[suggestion.confidence]}
                  icon={<Sparkles className="size-2.5" />}
                  label={CONFIDENCE_LABEL[suggestion.confidence]}
                />
              </div>
              <span className="text-[10.5px] text-muted-foreground/85">
                {suggestion.reason}
              </span>
            </div>
            <Pencil className="size-3.5 text-muted-foreground" />
          </motion.button>

          {/* Primary approve — single tap, optimistic. */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={onApprove}
            disabled={confirming}
            aria-label="אישור"
            className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-[color:var(--neon)]/85 text-[15px] font-semibold text-[#050505] outline-none transition-colors hover:bg-[color:var(--neon)] focus-visible:ring-2 focus-visible:ring-[color:var(--neon)] disabled:opacity-60"
          >
            <Check className="size-5" strokeWidth={2.4} />
            אישור
          </motion.button>

          {/* Secondary — reject pending row. */}
          <motion.button
            type="button"
            whileTap={CARD_TAP}
            onClick={onReject}
            disabled={confirming}
            aria-label="דחה — לא שייך"
            className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 px-3 py-2.5 text-[12px] text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
          >
            <Trash2 className="size-3.5" />
            לא שייך — מחק
          </motion.button>

          {entry.note ? (
            <p className="rounded-xl border border-white/8 bg-black/20 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
              {entry.note}
            </p>
          ) : null}
        </motion.div>
      </BottomSheet>

      {/* Category picker — only mounts when user wants to override. */}
      <BottomSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="בחר קטגוריה"
      >
        <div className="grid grid-cols-3 gap-2">
          {CATEGORIES.map((c) => {
            const CIcon = c.icon;
            const isActive = c.id === activeCategory;
            return (
              <motion.button
                key={c.id}
                type="button"
                whileTap={CARD_TAP}
                onClick={() => {
                  setOverride(c.id);
                  tap();
                  setPickerOpen(false);
                }}
                aria-pressed={isActive}
                className={`flex flex-col items-center gap-1 rounded-2xl border p-3 text-[11px] transition-colors ${
                  isActive
                    ? "border-[color:var(--neon)]/60 bg-[color:var(--neon)]/10 text-[color:var(--neon)]"
                    : "border-white/8 bg-black/25 text-foreground/85 hover:border-white/16"
                }`}
              >
                <span
                  className="flex size-8 items-center justify-center rounded-xl"
                  style={{
                    background: `${c.accent}22`,
                    color: c.accent,
                  }}
                >
                  <CIcon className="size-4" strokeWidth={1.8} />
                </span>
                {c.label}
              </motion.button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setPickerOpen(false)}
          className="mt-1 flex items-center justify-center gap-1 self-end text-[11px] text-muted-foreground hover:text-foreground"
        >
          <X className="size-3" />
          סגור
        </button>
      </BottomSheet>
    </>
  );
}
