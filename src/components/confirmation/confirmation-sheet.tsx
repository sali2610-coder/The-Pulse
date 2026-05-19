"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { GlassPopup } from "@/components/ui/glass-popup";
import { CategoryPickerSheet } from "@/components/confirmation/category-picker-sheet";
import { useFinanceStore } from "@/lib/store";
import { getCategory, type CategoryId } from "@/lib/categories";
import { categorize } from "@/lib/parsers";
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
  const [editingAmount, setEditingAmount] = useState(false);
  const [editingMerchant, setEditingMerchant] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [includeInBudget, setIncludeInBudget] = useState(
    !entry.excludeFromBudget,
  );

  const parsedAmount = Number(amount);
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
      installments: entry.installments,
      excludeFromBudget: !includeInBudget,
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
      <GlassPopup
        open={open}
        onOpenChange={onOpenChange}
        title="אישור חיוב חדש"
      >
        {/* Hero — amount + merchant. Tap either to edit inline. */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.3 }}
          className="flex flex-col items-center gap-1.5 pt-1"
        >
          <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/80">
            חיוב חדש
          </span>

          {editingAmount ? (
            <div
              className="flex items-baseline gap-1 font-mono text-4xl font-light tracking-tight text-foreground"
              dir="ltr"
            >
              <input
                autoFocus
                inputMode="decimal"
                value={amount}
                onChange={(e) =>
                  setAmount(e.target.value.replace(/[^\d.]/g, ""))
                }
                onBlur={() => setEditingAmount(false)}
                className="w-32 bg-transparent text-center outline-none ring-0"
              />
              <span className="text-2xl text-muted-foreground">₪</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                tap();
                setEditingAmount(true);
              }}
              className="font-mono text-4xl font-light tracking-tight text-foreground"
              dir="ltr"
            >
              {ILS.format(Number.isFinite(parsedAmount) ? parsedAmount : 0)}
            </button>
          )}

          {editingMerchant ? (
            <input
              autoFocus
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              onBlur={() => setEditingMerchant(false)}
              placeholder="שם בית עסק"
              className="w-full max-w-[220px] rounded-lg border border-white/12 bg-black/30 px-3 py-1.5 text-center text-sm text-foreground outline-none focus:border-[color:var(--neon)]"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                tap();
                setEditingMerchant(true);
              }}
              className="text-sm font-medium text-foreground"
            >
              {merchant.trim() || "עסק לא ידוע"}
            </button>
          )}

          {entry.cardLast4 ? (
            <span dir="ltr" className="text-[10px] text-muted-foreground/80">
              ····{entry.cardLast4}
            </span>
          ) : null}
        </motion.div>

        {/* Category chip */}
        <motion.button
          type="button"
          onClick={() => {
            tap();
            setPickerOpen(true);
          }}
          whileTap={{ scale: 0.98 }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.28 }}
          className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/30 p-2.5 text-start"
        >
          <span className="flex items-center gap-2">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{
                background: `${categoryMeta.accent}22`,
                color: categoryMeta.accent,
              }}
            >
              <categoryMeta.icon className="h-4 w-4" strokeWidth={1.6} />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-[10px] text-muted-foreground">
                קטגוריה
              </span>
              <span className="text-sm font-medium text-foreground">
                {categoryMeta.label}
              </span>
            </span>
          </span>
          <span className="text-[10px] text-muted-foreground">החלף</span>
        </motion.button>

        {/* Budget inclusion — compact row */}
        <motion.label
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.28 }}
          className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/30 p-2.5"
        >
          <div className="flex flex-col gap-0.5 text-right leading-tight">
            <span className="text-[12px] font-medium text-foreground">
              כלול בתקציב
            </span>
            <span className="text-[10px] text-muted-foreground">
              {includeInBudget ? "נספר בחודש" : "לא נספר בחודש"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              tap();
              setIncludeInBudget((v) => !v);
            }}
            dir="ltr"
            aria-pressed={includeInBudget}
            className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
              includeInBudget
                ? "border-[color:var(--neon)]/70 bg-[color:var(--neon)]/20"
                : "border-white/20 bg-background/40"
            }`}
          >
            <motion.span
              initial={false}
              animate={{
                left: includeInBudget ? "21px" : "2px",
                backgroundColor: includeInBudget ? "#00E5FF" : "#A1A1AA",
              }}
              transition={{ type: "spring", stiffness: 500, damping: 32 }}
              className="absolute top-1/2 block size-4 -translate-y-1/2 rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.4)]"
            />
          </button>
        </motion.label>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14, duration: 0.28 }}
          className="flex flex-col gap-1.5 pt-0.5"
        >
          <button
            type="button"
            onClick={handleConfirm}
            className="btn-confirm flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold transition-transform active:scale-[0.99]"
          >
            <Check className="h-4 w-4" strokeWidth={2.4} />
            אשר והוסף
          </button>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => {
                tap();
                setEditingAmount(true);
              }}
              className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-black/30 text-[12px] text-foreground/90 transition-colors hover:border-white/20"
            >
              <Pencil className="h-3.5 w-3.5" />
              ערוך סכום
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="btn-cancel flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-[12px] font-semibold transition-transform active:scale-[0.99]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              לא שלי
            </button>
          </div>
        </motion.div>
      </GlassPopup>

      <CategoryPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selected={category}
        suggested={(() => {
          if (!merchant.trim()) return undefined;
          const hint = categorize(merchant.trim()) as CategoryId;
          return hint !== "other" ? hint : undefined;
        })()}
        onSelect={(id) => setCategory(id)}
      />
    </>
  );
}
