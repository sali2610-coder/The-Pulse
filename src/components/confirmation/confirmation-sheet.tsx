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
        {/* Compact layout — Apple Wallet / Live Activity vibe. Two
            tight rows: meta row (amount + merchant + meta chips) and
            action row (confirm + reject + edit). Total height
            ≈ 110-130px on iPhone, no scroll, single screen. */}
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04, duration: 0.22 }}
          className="flex items-center gap-2.5 pt-0.5"
        >
          {/* Amount + merchant — primary visual focus, flex-1 */}
          <div className="flex min-w-0 flex-1 flex-col leading-none">
            {editingAmount ? (
              <div
                className="flex items-baseline gap-0.5 font-mono text-[26px] font-light tracking-tight text-foreground"
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
                  className="w-24 bg-transparent outline-none ring-0"
                />
                <span className="text-[16px] text-muted-foreground">₪</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  tap();
                  setEditingAmount(true);
                }}
                className="text-start font-mono text-[26px] font-light leading-none tracking-tight text-foreground"
                dir="ltr"
              >
                {ILS.format(
                  Number.isFinite(parsedAmount) ? parsedAmount : 0,
                )}
              </button>
            )}

            {editingMerchant ? (
              <input
                autoFocus
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                onBlur={() => setEditingMerchant(false)}
                placeholder="שם בית עסק"
                className="mt-1 w-full max-w-[200px] truncate rounded-md border border-white/12 bg-black/30 px-2 py-0.5 text-[12px] text-foreground outline-none focus:border-[color:var(--neon)]"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  tap();
                  setEditingMerchant(true);
                }}
                className="mt-1 flex items-center gap-1 text-start text-[12px] font-medium text-muted-foreground"
              >
                <span className="truncate">
                  {merchant.trim() || "עסק לא ידוע"}
                </span>
                <Pencil className="h-2.5 w-2.5 shrink-0 text-[#34D399]" />
              </button>
            )}
            {entry.cardLast4 ? (
              <span
                dir="ltr"
                className="mt-0.5 text-[9px] text-muted-foreground/70"
              >
                ····{entry.cardLast4}
              </span>
            ) : null}
          </div>

          {/* Category chip — tap to open picker. */}
          <motion.button
            type="button"
            onClick={() => {
              tap();
              setPickerOpen(true);
            }}
            whileTap={{ scale: 0.96 }}
            className="flex shrink-0 flex-col items-center gap-0.5 rounded-xl border border-white/10 bg-black/30 px-2 py-1.5 text-center"
            aria-label="החלף קטגוריה"
          >
            <span
              className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{
                background: `${categoryMeta.accent}22`,
                color: categoryMeta.accent,
              }}
            >
              <categoryMeta.icon className="h-3.5 w-3.5" strokeWidth={1.6} />
            </span>
            <span className="text-[9px] leading-none text-muted-foreground">
              {categoryMeta.label}
            </span>
          </motion.button>

          {/* Budget toggle — compact pill */}
          <button
            type="button"
            onClick={() => {
              tap();
              setIncludeInBudget((v) => !v);
            }}
            dir="ltr"
            aria-label={
              includeInBudget ? "נכלל בתקציב" : "לא נכלל בתקציב"
            }
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
        </motion.div>

        {/* Action row — confirm primary, reject + edit secondary */}
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.22 }}
          className="flex items-center gap-1.5 pt-0.5"
        >
          <button
            type="button"
            onClick={handleConfirm}
            className="btn-confirm flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold transition-transform active:scale-[0.99]"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
            אשר והוסף
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="לא שלי"
            className="btn-cancel flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform active:scale-[0.99]"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              tap();
              setEditingAmount(true);
            }}
            aria-label="ערוך סכום"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/12 bg-black/30 text-foreground/90 transition-colors hover:border-white/20"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
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
