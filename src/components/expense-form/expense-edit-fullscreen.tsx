"use client";

// Phase 367 — full-screen expense edit experience.
//
// Replaces the old Dialog / GlassPopup edit sheets that clipped on
// mobile. Apple Wallet / Revolut / iOS Settings energy:
//
//   ┌───────────────────────────────────────────┐
//   │  ‹  עריכת הוצאה                            │  header
//   │                                            │
//   │            ╭─────────╮                     │
//   │            │   🍔    │   <- huge cat icon  │  hero
//   │            ╰─────────╯                     │
//   │            ₪  240                          │  hero amount
//   │                                            │
//   │  שם בית עסק                                │  fields...
//   │  קטגוריה                                   │
//   │  אמצעי תשלום                              │
//   │  כרטיס                                     │
//   │  תאריך החיוב                              │
//   │  מספר תשלומים                             │
//   │  הערה                                      │
//   │                                            │
//   │  [   שמור שינויים   ]                      │  sticky
//   │      מחק עסקה                              │  footer
//   └───────────────────────────────────────────┘
//
// Engine + math untouched. Talks to store.updateExpense / deleteExpense
// the same way the legacy sheet did.

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight, Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { CategoryPickerSheet } from "@/components/confirmation/category-picker-sheet";
import { useFinanceStore } from "@/lib/store";
import { getCategory, type CategoryId } from "@/lib/categories";
import { tap as hapticTap, success as hapticSuccess } from "@/lib/haptics";
import type { ExpenseEntry } from "@/types/finance";

type Props = {
  entryId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function isoToDateInput(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return "";
  }
}

function dateInputToIso(input: string, fallback: string): string {
  if (!input) return fallback;
  const [y, m, d] = input.split("-").map(Number);
  if (!y || !m || !d) return fallback;
  const next = new Date(y, m - 1, d, 12, 0, 0);
  return next.toISOString();
}

export function ExpenseEditFullScreen({ entryId, open, onOpenChange }: Props) {
  const entry = useFinanceStore((s) =>
    entryId ? s.entries.find((e) => e.id === entryId) : undefined,
  );

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="עריכת הוצאה"
      fullScreen
      lockDismiss
      noHandle
    >
      {/* key remount makes each entry seed its own EditBody with
          fresh useState defaults — avoids set-state-in-effect. */}
      {entry ? (
        <EditBody
          key={entry.id}
          entry={entry}
          onOpenChange={onOpenChange}
        />
      ) : null}
    </BottomSheet>
  );
}

function EditBody({
  entry,
  onOpenChange,
}: {
  entry: ExpenseEntry;
  onOpenChange: (open: boolean) => void;
}) {
  const accounts = useFinanceStore((s) => s.accounts);
  const updateExpense = useFinanceStore((s) => s.updateExpense);
  const deleteExpense = useFinanceStore((s) => s.deleteExpense);

  const [amount, setAmount] = useState(String(entry.amount));
  const [merchant, setMerchant] = useState(entry.merchant ?? "");
  const [category, setCategory] = useState<CategoryId>(entry.category);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "credit">(
    entry.paymentMethod,
  );
  const [accountId, setAccountId] = useState<string | undefined>(entry.accountId);
  const [chargeDate, setChargeDate] = useState(isoToDateInput(entry.chargeDate));
  const [installments, setInstallments] = useState(
    Math.max(1, entry.installments),
  );
  const [note, setNote] = useState(entry.note ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);

  const meta = useMemo(() => getCategory(category), [category]);
  const activeCards = useMemo(
    () => accounts.filter((a) => a.kind === "card" && a.active),
    [accounts],
  );

  const amountNum = Number(amount);
  const canSave =
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    installments >= 1 &&
    installments <= 60 &&
    (paymentMethod === "cash" || !!accountId || activeCards.length === 0);

  const handleSave = () => {
    if (!canSave) return;
    const next = updateExpense(entry.id, {
      amount: amountNum,
      merchant: merchant.trim(),
      category,
      installments,
      paymentMethod,
      accountId: paymentMethod === "credit" ? accountId ?? "" : "",
      chargeDate: dateInputToIso(chargeDate, entry.chargeDate),
      note: note.trim(),
    });
    if (!next) {
      toast.error("שמירה נכשלה");
      return;
    }
    hapticSuccess();
    toast.success("השינויים נשמרו");
    onOpenChange(false);
  };

  const handleDelete = () => {
    const label = entry.merchant?.trim() || meta.label;
    const ok = window.confirm(
      `למחוק את ההוצאה "${label}" על סך ₪${Math.round(entry.amount).toLocaleString("he-IL")}?`,
    );
    if (!ok) return;
    deleteExpense(entry.id);
    toast.success("ההוצאה נמחקה");
    onOpenChange(false);
  };

  return (
    <>
      <div
        className="flex h-full flex-col gap-4 pb-3"
        dir="rtl"
        data-section="expense-edit"
      >
        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto pe-1 ps-1">
          <div className="flex flex-col gap-4 pb-4">
            {/* Header — back row */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  hapticTap();
                  onOpenChange(false);
                }}
                aria-label="חזרה"
                className="inline-flex size-9 items-center justify-center rounded-full border border-white/8 bg-black/30 text-foreground/85 transition-colors hover:border-white/16"
              >
                <ChevronRight className="size-4" aria-hidden />
              </button>
              <span className="text-[12.5px] font-medium text-foreground/85">
                עריכת הוצאה
              </span>
              <span className="size-9" aria-hidden />
            </div>

            {/* Category icon hero */}
            <div className="flex flex-col items-center gap-2 pt-2">
              <motion.span
                key={category}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 22 }}
                className="flex size-24 items-center justify-center rounded-3xl"
                style={{
                  background: `${meta.accent}22`,
                  color: meta.accent,
                  boxShadow: `0 0 36px -12px ${meta.accent}66, 0 1px 0 rgba(255,255,255,0.04) inset`,
                }}
                aria-hidden
              >
                <meta.icon className="size-12" strokeWidth={1.4} />
              </motion.span>
              <span className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                {meta.label}
              </span>
            </div>

            {/* Amount hero */}
            <div className="flex flex-col items-center gap-1 pb-1">
              <div
                className="flex items-baseline gap-1 text-foreground"
                dir="ltr"
              >
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) =>
                    setAmount(e.target.value.replace(/[^\d.]/g, ""))
                  }
                  aria-label="סכום"
                  data-mono="true"
                  className="w-48 bg-transparent text-center text-[52px] font-light leading-none tracking-tight outline-none ring-0"
                  style={{
                    fontVariantNumeric: "tabular-nums",
                    color: meta.accent,
                    textShadow: `0 0 28px ${meta.accent}44`,
                  }}
                />
                <span className="text-[24px] text-muted-foreground">₪</span>
              </div>
              <span className="text-[10.5px] uppercase tracking-[0.3em] text-muted-foreground">
                סכום ההוצאה
              </span>
            </div>

            {/* Fields list */}
            <ul className="flex flex-col divide-y divide-white/6 rounded-2xl border border-white/8 bg-white/[0.02]">
              <FieldRow label="שם בית עסק">
                <input
                  type="text"
                  value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                  maxLength={100}
                  placeholder="שופרסל / דלק…"
                  className="w-full bg-transparent text-end text-[13.5px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                />
              </FieldRow>

              <FieldRow label="קטגוריה">
                <button
                  type="button"
                  onClick={() => {
                    hapticTap();
                    setPickerOpen(true);
                  }}
                  className="inline-flex items-center gap-2 text-[13.5px]"
                  style={{ color: meta.accent }}
                >
                  <meta.icon className="size-3.5" aria-hidden />
                  {meta.label}
                </button>
              </FieldRow>

              <FieldRow label="אמצעי תשלום">
                <PaymentToggle
                  value={paymentMethod}
                  onChange={(v) => {
                    hapticTap();
                    setPaymentMethod(v);
                    if (v === "cash") setAccountId(undefined);
                  }}
                />
              </FieldRow>

              {paymentMethod === "credit" && activeCards.length > 0 ? (
                <FieldRow label="כרטיס">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {activeCards.map((c) => {
                      const active = c.id === accountId;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            hapticTap();
                            setAccountId(c.id);
                          }}
                          className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors"
                          style={{
                            color: active ? "#1A140A" : "rgba(255,255,255,0.85)",
                            background: active
                              ? "linear-gradient(180deg,#F6D970 0%,#D4AF37 100%)"
                              : "transparent",
                            borderColor: active
                              ? "transparent"
                              : "rgba(255,255,255,0.14)",
                          }}
                        >
                          {c.label}
                          {c.cardLast4 ? ` ····${c.cardLast4}` : ""}
                        </button>
                      );
                    })}
                  </div>
                </FieldRow>
              ) : null}

              <FieldRow label="תאריך החיוב">
                <input
                  type="date"
                  value={chargeDate}
                  onChange={(e) => setChargeDate(e.target.value)}
                  className="bg-transparent text-[13.5px] text-foreground focus:outline-none"
                  dir="ltr"
                />
              </FieldRow>

              {paymentMethod === "credit" ? (
                <FieldRow label="מספר תשלומים">
                  <Stepper
                    value={installments}
                    onChange={setInstallments}
                    min={1}
                    max={60}
                  />
                </FieldRow>
              ) : null}

              <FieldRow label="הערה" stacked>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={200}
                  placeholder="אופציונלי"
                  className="w-full resize-none rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:border-white/16 focus:outline-none"
                />
              </FieldRow>
            </ul>
          </div>
        </div>

        {/* Sticky action footer — sits at the bottom of the
           BottomSheet body, just above the safe-area pad. */}
        <div
          className="flex flex-col gap-2 border-t border-white/8 pt-3"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
        >
          <button
            type="button"
            onClick={() => {
              hapticTap();
              handleSave();
            }}
            disabled={!canSave}
            className="h-12 rounded-2xl text-[14.5px] font-semibold transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: "linear-gradient(180deg, #F6D970 0%, #D4AF37 100%)",
              color: "#1A140A",
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.4) inset, 0 8px 22px -6px rgba(212,175,55,0.55)",
            }}
          >
            שמור שינויים
          </button>
          <button
            type="button"
            onClick={() => {
              hapticTap();
              handleDelete();
            }}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl text-[13px] text-red-400 transition-colors hover:text-red-300"
          >
            <Trash2 className="size-3.5" aria-hidden />
            מחק עסקה
          </button>
        </div>
      </div>

      <CategoryPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selected={category}
        onSelect={(id) => {
          hapticTap();
          setCategory(id);
        }}
      />
    </>
  );
}

function FieldRow({
  label,
  stacked,
  children,
}: {
  label: string;
  stacked?: boolean;
  children: React.ReactNode;
}) {
  if (stacked) {
    return (
      <li className="flex flex-col gap-1.5 px-3.5 py-2.5">
        <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          {label}
        </span>
        {children}
      </li>
    );
  }
  return (
    <li className="flex items-center justify-between gap-3 px-3.5 py-2.5">
      <span className="shrink-0 text-[12px] uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </span>
      <span className="flex flex-1 justify-end">{children}</span>
    </li>
  );
}

function PaymentToggle({
  value,
  onChange,
}: {
  value: "cash" | "credit";
  onChange: (v: "cash" | "credit") => void;
}) {
  const OPTIONS: Array<{ id: "cash" | "credit"; label: string }> = [
    { id: "cash", label: "מזומן" },
    { id: "credit", label: "אשראי" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="אמצעי תשלום"
      className="relative inline-flex rounded-full border border-white/10 bg-black/35 p-1 text-[12px]"
    >
      {OPTIONS.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            className="relative inline-flex h-7 items-center justify-center rounded-full px-3 transition-colors"
            style={{
              color: active ? "#1A140A" : "rgba(255,255,255,0.85)",
            }}
          >
            {active ? (
              <motion.span
                layoutId="edit-payment-pill"
                aria-hidden
                className="absolute inset-0 rounded-full"
                style={{
                  background: "linear-gradient(180deg,#F6D970 0%,#D4AF37 100%)",
                  boxShadow: "0 1px 0 rgba(255,255,255,0.4) inset",
                }}
                transition={{ type: "spring", stiffness: 360, damping: 30 }}
              />
            ) : null}
            <span className="relative z-10">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Stepper({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-1.5 py-1">
      <button
        type="button"
        onClick={() => {
          hapticTap();
          onChange(Math.max(min, value - 1));
        }}
        aria-label="פחות תשלומים"
        className="inline-flex size-6 items-center justify-center rounded-full border border-white/10 bg-white/5 transition-colors hover:border-white/20"
      >
        <Minus className="size-3" aria-hidden />
      </button>
      <span
        data-mono="true"
        dir="ltr"
        className="min-w-7 text-center text-[13px] text-foreground tabular-nums"
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => {
          hapticTap();
          onChange(Math.min(max, value + 1));
        }}
        aria-label="עוד תשלום"
        className="inline-flex size-6 items-center justify-center rounded-full border border-white/10 bg-white/5 transition-colors hover:border-white/20"
      >
        <Plus className="size-3" aria-hidden />
      </button>
    </div>
  );
}
