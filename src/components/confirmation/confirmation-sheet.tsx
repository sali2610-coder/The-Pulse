"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { CategoryPickerSheet } from "@/components/confirmation/category-picker-sheet";
import { useFinanceStore } from "@/lib/store";
import { getCategory, type CategoryId } from "@/lib/categories";
import { success, tap } from "@/lib/haptics";
import type { ExpenseEntry } from "@/types/finance";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 2,
});

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: ExpenseEntry;
};

export function ConfirmationSheet({ open, onOpenChange, entry }: Props) {
  const confirmExpense = useFinanceStore((s) => s.confirmExpense);
  const dismissPending = useFinanceStore((s) => s.dismissPending);

  const [amount, setAmount] = useState(String(entry.amount));
  const [merchant, setMerchant] = useState(entry.merchant ?? "");
  const [category, setCategory] = useState<CategoryId>(entry.category);
  const [installments, setInstallments] = useState(entry.installments);
  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Re-syncing on `entry.id` change is handled by the parent passing a
  // `key={entry.id}` so this component remounts with fresh local state.

  const parsedAmount = Number(amount);
  const slice =
    installments > 1 && Number.isFinite(parsedAmount)
      ? parsedAmount / installments
      : null;
  const categoryMeta = getCategory(category);

  function handleConfirm() {
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("הסכום אינו תקין");
      return;
    }
    confirmExpense(entry.id, {
      amount: parsedAmount,
      merchant: merchant.trim(),
      category,
      installments,
    });
    success();
    toast.success("החיוב אושר", {
      description: merchant.trim() || categoryMeta.label,
    });
    onOpenChange(false);
  }

  function handleDismiss() {
    tap();
    dismissPending(entry.id);
    toast("החיוב נמחק", { description: "לא היה שלך — הוסר מהמערכת." });
    onOpenChange(false);
  }

  return (
    <>
      <BottomSheet
        open={open}
        onOpenChange={onOpenChange}
        title="אישור חיוב חדש"
      >
        {/* Hero block — amount + merchant */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.35 }}
          className="flex flex-col items-center gap-2 pt-2"
        >
          <span className="text-xs uppercase tracking-[0.28em] text-muted-foreground/80">
            חיוב חדש
          </span>

          {editing ? (
            <input
              autoFocus
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              className="w-full bg-transparent text-center font-mono text-6xl font-light tracking-tight text-foreground outline-none ring-0"
              dir="ltr"
            />
          ) : (
            <div
              dir="ltr"
              className="font-mono text-6xl font-light tracking-tight text-foreground"
            >
              {ILS.format(Number.isFinite(parsedAmount) ? parsedAmount : 0)}
            </div>
          )}

          {slice && (
            <span className="text-xs text-muted-foreground">
              {installments}× של{" "}
              <span dir="ltr" className="font-mono">
                {ILS.format(slice)}
              </span>
            </span>
          )}

          {editing ? (
            <input
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="שם בית עסק"
              className="w-full max-w-xs rounded-xl border border-white/10 bg-surface/70 px-4 py-2 text-center text-base text-foreground outline-none focus:border-[color:var(--neon)]"
            />
          ) : (
            <div className="text-lg font-medium text-foreground">
              {merchant.trim() || "עסק לא ידוע"}
            </div>
          )}

          {entry.cardLast4 && (
            <span dir="ltr" className="text-xs text-muted-foreground/80">
              ····{entry.cardLast4}
            </span>
          )}
        </motion.div>

        {/* Category chip — taps open the picker sheet */}
        <motion.button
          type="button"
          onClick={() => {
            tap();
            setPickerOpen(true);
          }}
          whileTap={{ scale: 0.97 }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-surface/60 p-3 text-start"
        >
          <span className="flex items-center gap-3">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{
                background: `${categoryMeta.accent}22`,
                color: categoryMeta.accent,
              }}
            >
              <categoryMeta.icon className="h-5 w-5" strokeWidth={1.6} />
            </span>
            <span className="flex flex-col">
              <span className="text-xs text-muted-foreground">קטגוריה</span>
              <span className="text-base font-medium text-foreground">
                {categoryMeta.label}
              </span>
            </span>
          </span>
          <span className="text-xs text-muted-foreground">החלף</span>
        </motion.button>

        {/* Installments controls — only shown in edit mode */}
        {editing && (
          <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-surface/60 p-3">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">תשלומים</span>
              <span className="text-base font-medium">{installments}</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  tap();
                  setInstallments((n) => Math.max(1, n - 1));
                }}
                className="h-9 w-9 rounded-full border border-white/12 bg-surface/80 text-foreground"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => {
                  tap();
                  setInstallments((n) => Math.min(60, n + 1));
                }}
                className="h-9 w-9 rounded-full border border-white/12 bg-surface/80 text-foreground"
              >
                +
              </button>
            </div>
          </div>
        )}

        {/* Action buttons — large, green/red, premium feel */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.32 }}
          className="flex flex-col gap-2 pt-1"
        >
          <button
            type="button"
            onClick={handleConfirm}
            className="btn-confirm flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-semibold transition-transform active:scale-[0.99]"
          >
            <Check className="h-5 w-5" strokeWidth={2.2} />
            אשר חיוב
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                tap();
                setEditing((v) => !v);
              }}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-surface/60 text-sm text-foreground/90 transition-colors hover:border-white/20"
            >
              {editing ? (
                <>
                  <X className="h-4 w-4" /> סיים עריכה
                </>
              ) : (
                <>
                  <Pencil className="h-4 w-4" /> ערוך
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="btn-cancel flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition-transform active:scale-[0.99]"
            >
              <Trash2 className="h-4 w-4" />
              לא שלי
            </button>
          </div>
        </motion.div>
      </BottomSheet>

      <CategoryPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selected={category}
        onSelect={(id) => setCategory(id)}
      />
    </>
  );
}

