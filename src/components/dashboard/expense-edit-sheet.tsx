"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Banknote,
  Check,
  CreditCard,
  Link2,
  Link2Off,
  Minus,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { GlassPopup } from "@/components/ui/glass-popup";
import { CategoryPickerSheet } from "@/components/confirmation/category-picker-sheet";
import { getCategory, type CategoryId } from "@/lib/categories";
import { useFinanceStore } from "@/lib/store";
import { success, tap } from "@/lib/haptics";
import { getIssuerMeta } from "@/lib/card-issuers";
import type { ExpenseEntry, PaymentMethod } from "@/types/finance";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 2,
});

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: ExpenseEntry | null;
};

/**
 * Premium edit-in-place sheet for any existing transaction. Mirrors the
 * compact ConfirmationSheet shape — same GlassPopup chrome — so the
 * affordance reads as "tap any transaction to refine it" instead of a
 * separate "edit" mode hidden in a menu.
 *
 * Edits land via `confirmExpense`, which already applies a Partial<>
 * patch + sets `confirmedAt`. Delete uses `deleteExpense`.
 */
export function ExpenseEditSheet({ open, onOpenChange, entry }: Props) {
  const updateExpense = useFinanceStore((s) => s.updateExpense);
  const relinkExpense = useFinanceStore((s) => s.relinkExpense);
  const deleteExpense = useFinanceStore((s) => s.deleteExpense);
  const rules = useFinanceStore((s) => s.rules);
  const accounts = useFinanceStore((s) => s.accounts);

  const [amount, setAmount] = useState(entry ? String(entry.amount) : "");
  const [merchant, setMerchant] = useState(entry?.merchant ?? "");
  const [category, setCategory] = useState<CategoryId>(
    (entry?.category as CategoryId) ?? "other",
  );
  const [installments, setInstallments] = useState<number>(
    entry?.installments ?? 1,
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    entry?.paymentMethod ?? "credit",
  );
  const [accountId, setAccountId] = useState<string | undefined>(
    entry?.accountId,
  );
  const [includeInBudget, setIncludeInBudget] = useState(
    !entry?.excludeFromBudget,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [rulePickerOpen, setRulePickerOpen] = useState(false);
  const [editingAmount, setEditingAmount] = useState(false);

  const matchedRule = entry?.matchedRuleId
    ? rules.find((r) => r.id === entry.matchedRuleId)
    : undefined;

  const activeCards = accounts.filter((a) => a.kind === "card" && a.active);
  const candidateRules = rules.filter(
    (r) => r.active && r.category === category,
  );

  if (!entry) return null;
  const parsedAmount = Number(amount);
  const meta = getCategory(category);

  function save() {
    if (!entry) return;
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("הסכום אינו תקין");
      return;
    }
    updateExpense(entry.id, {
      amount: parsedAmount,
      merchant: merchant.trim(),
      category,
      installments,
      paymentMethod,
      accountId: paymentMethod === "credit" ? accountId ?? "" : "",
      excludeFromBudget: !includeInBudget,
    });
    success();
    toast.success("נשמר", { description: merchant.trim() || meta.label });
    onOpenChange(false);
  }

  function unlinkRule() {
    if (!entry) return;
    tap();
    relinkExpense(entry.id, null);
    toast("קישור הוסר");
  }

  function linkToRule(ruleId: string) {
    if (!entry) return;
    tap();
    relinkExpense(entry.id, ruleId);
    setRulePickerOpen(false);
    toast.success("נקשר לקבוע");
  }

  function remove() {
    if (!entry) return;
    tap();
    if (!confirm("למחוק את ההוצאה?")) return;
    deleteExpense(entry.id);
    toast("ההוצאה נמחקה");
    onOpenChange(false);
  }

  return (
    <>
      <GlassPopup
        open={open}
        onOpenChange={onOpenChange}
        title="עריכת הוצאה"
      >
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04, duration: 0.28 }}
          className="flex flex-col items-center gap-1.5 pt-1"
        >
          <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/80">
            עריכת הוצאה
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

          <input
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder="שם בית עסק"
            className="w-full max-w-[220px] rounded-lg border border-white/12 bg-black/30 px-3 py-1.5 text-center text-sm text-foreground outline-none focus:border-[color:var(--neon)]"
          />
        </motion.div>

        {/* Category */}
        <motion.button
          type="button"
          onClick={() => {
            tap();
            setPickerOpen(true);
          }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/30 p-2.5 text-start"
        >
          <span className="flex items-center gap-2">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{
                background: `${meta.accent}22`,
                color: meta.accent,
              }}
            >
              <meta.icon className="h-4 w-4" strokeWidth={1.6} />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-[10px] text-muted-foreground">קטגוריה</span>
              <span className="text-sm font-medium text-foreground">
                {meta.label}
              </span>
            </span>
          </span>
          <span className="text-[10px] text-muted-foreground">החלף</span>
        </motion.button>

        {/* Payment method */}
        <div className="grid grid-cols-2 gap-2">
          {(["credit", "cash"] as const).map((pm) => (
            <button
              key={pm}
              type="button"
              onClick={() => {
                tap();
                setPaymentMethod(pm);
                if (pm === "cash") setAccountId(undefined);
              }}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs transition-colors ${
                paymentMethod === pm
                  ? "border-neon/60 bg-background/80 text-foreground"
                  : "border-border/60 bg-background/40 text-muted-foreground"
              }`}
            >
              {pm === "credit" ? (
                <CreditCard className="size-3.5" />
              ) : (
                <Banknote className="size-3.5" />
              )}
              {pm === "credit" ? "אשראי" : "מזומן"}
            </button>
          ))}
        </div>

        {/* Account picker — credit only, only when there are cards */}
        {paymentMethod === "credit" && activeCards.length > 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/30 p-2.5">
            <div className="mb-1.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              כרטיס
            </div>
            <div className="flex flex-wrap gap-1.5">
              {activeCards.map((card) => {
                const meta = getIssuerMeta(card.issuer);
                const active = accountId === card.id;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => {
                      tap();
                      setAccountId(active ? undefined : card.id);
                    }}
                    className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] transition-colors ${
                      active
                        ? "border-neon/60 bg-background/80 text-foreground"
                        : "border-white/12 bg-background/40 text-muted-foreground"
                    }`}
                  >
                    <span
                      aria-hidden
                      className="inline-block size-2 rounded-full"
                      style={{ background: card.color ?? meta.accent }}
                    />
                    <span>{card.label}</span>
                    {card.cardLast4 ? (
                      <span
                        data-mono="true"
                        className="text-[10px] text-muted-foreground/70"
                        style={{ direction: "ltr" }}
                      >
                        ····{card.cardLast4}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Budget inclusion */}
        <label className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/30 p-2.5">
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
        </label>

        {/* Installments */}
        <div
          className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/30 p-2.5"
          dir="ltr"
        >
          <div className="flex flex-col gap-0.5 text-start leading-tight">
            <span className="text-[12px] font-medium text-foreground">
              תשלומים
            </span>
            <span className="text-[10px] text-muted-foreground">
              {installments > 1
                ? `${installments}× חיוב חודשי`
                : "תשלום בודד"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                tap();
                setInstallments((v) => Math.max(1, v - 1));
              }}
              className="flex size-7 items-center justify-center rounded-lg border border-white/12 bg-background/40 text-foreground hover:border-white/30"
              aria-label="פחות תשלום"
            >
              <Minus className="size-3.5" />
            </button>
            <span
              data-mono="true"
              className="w-7 text-center text-sm font-medium text-foreground"
            >
              {installments}
            </span>
            <button
              type="button"
              onClick={() => {
                tap();
                setInstallments((v) => Math.min(60, v + 1));
              }}
              className="flex size-7 items-center justify-center rounded-lg border border-white/12 bg-background/40 text-foreground hover:border-white/30"
              aria-label="עוד תשלום"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Linked recurring rule */}
        {matchedRule ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/30 p-2.5">
            <div className="flex min-w-0 flex-col gap-0.5 leading-tight">
              <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                <Link2 className="size-3 text-neon" />
                מקושר לקבוע
              </span>
              <span className="truncate text-[12.5px] font-medium text-foreground">
                {matchedRule.label}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  tap();
                  setRulePickerOpen((v) => !v);
                }}
                className="flex items-center gap-1 rounded-lg border border-white/12 bg-background/40 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-white/30 hover:text-foreground"
              >
                החלף
              </button>
              <button
                type="button"
                onClick={unlinkRule}
                className="flex items-center gap-1 rounded-lg border border-white/12 bg-background/40 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
              >
                <Link2Off className="size-3" />
                נתק
              </button>
            </div>
          </div>
        ) : candidateRules.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              tap();
              setRulePickerOpen((v) => !v);
            }}
            className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-white/10 bg-black/20 p-2.5 text-[11px] text-muted-foreground transition-colors hover:border-neon/40 hover:text-foreground"
          >
            <span className="flex items-center gap-1.5">
              <Link2 className="size-3 text-neon" />
              קשר לקבוע באותה קטגוריה
            </span>
            <span className="text-[10px] text-muted-foreground/70">
              {candidateRules.length} זמינים
            </span>
          </button>
        ) : null}

        {rulePickerOpen ? (
          <div className="rounded-xl border border-white/10 bg-black/30 p-2.5">
            <div className="mb-1.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              חוקים בקטגוריה {meta.label}
            </div>
            {candidateRules.length === 0 ? (
              <div className="text-[11px] text-muted-foreground">
                אין חוקים פעילים בקטגוריה הזו.
              </div>
            ) : (
              <ul className="flex flex-col gap-1">
                {candidateRules.map((r) => {
                  const active = r.id === matchedRule?.id;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => linkToRule(r.id)}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-[12px] transition-colors ${
                          active
                            ? "border-neon/60 bg-background/80 text-foreground"
                            : "border-white/12 bg-background/40 text-muted-foreground hover:border-white/30 hover:text-foreground"
                        }`}
                      >
                        <span className="truncate">{r.label}</span>
                        <span
                          data-mono="true"
                          dir="ltr"
                          className="text-[10px] text-muted-foreground/70"
                        >
                          ₪{r.estimatedAmount} · {r.dayOfMonth}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}

        {/* Actions */}
        <div className="flex flex-col gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={save}
            className="btn-confirm flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold transition-transform active:scale-[0.99]"
          >
            <Check className="h-4 w-4" strokeWidth={2.4} />
            שמור שינויים
          </button>
          <button
            type="button"
            onClick={remove}
            className="btn-cancel flex h-10 w-full items-center justify-center gap-1.5 rounded-xl text-[12px] font-semibold transition-transform active:scale-[0.99]"
          >
            <Trash2 className="h-3.5 w-3.5" />
            מחק הוצאה
          </button>
        </div>
      </GlassPopup>

      <CategoryPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selected={category}
        onSelect={(id) => setCategory(id)}
      />
    </>
  );
}
