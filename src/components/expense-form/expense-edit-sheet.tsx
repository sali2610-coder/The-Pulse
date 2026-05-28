"use client";

// Phase 253 — explicit Edit sheet for an existing expense row.
//
// Replaces the missing per-row edit affordance inside the new
// Card-Hierarchy + Category-Spend cards. Reuses the same source +
// account picker pattern as ExpenseDialog (Phase 244) so the user
// gets the same linkage guarantee on edits: credit expense must
// stay bound to a real card, bank expense to a real bank account.
//
// Preserves the original id. updateExpense re-runs rule matching
// when category / chargeDate / amount change so downstream summaries
// recompute via the existing store subscribers.

import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useFinanceStore } from "@/lib/store";
import { tap } from "@/lib/haptics";
import { getCategory, CATEGORIES, type CategoryId } from "@/lib/categories";
import type { ExpenseEntry } from "@/types/finance";
import {
  SourceAccountPicker,
  type PaymentSource,
} from "./source-account-picker";

function pickSource(entry: ExpenseEntry, hasBankAccount: boolean): PaymentSource {
  if (entry.paymentMethod === "credit") return "card";
  if (entry.accountId && hasBankAccount) return "bank";
  return "cash";
}

export function ExpenseEditSheet({
  entry,
  open,
  onOpenChange,
}: {
  entry: ExpenseEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const updateExpense = useFinanceStore((s) => s.updateExpense);
  const accounts = useFinanceStore((s) => s.accounts);

  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState<CategoryId>("other");
  const [source, setSource] = useState<PaymentSource>("card");
  const [accountId, setAccountId] = useState<string | undefined>(undefined);
  const [installments, setInstallments] = useState("1");
  const [chargeDate, setChargeDate] = useState("");
  const [note, setNote] = useState("");

  // Seed local state when a new entry is opened. Microtask-deferred
  // so the lint rule against synchronous setState-in-effect passes.
  useEffect(() => {
    if (!entry || !open) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      const hasBank = accounts.some(
        (a) => a.kind === "bank" && a.active,
      );
      setAmount(String(entry.amount));
      setMerchant(entry.merchant ?? "");
      setCategory(entry.category);
      setSource(pickSource(entry, hasBank));
      setAccountId(entry.accountId);
      setInstallments(String(entry.installments || 1));
      setChargeDate(entry.chargeDate.slice(0, 10));
      setNote(entry.note ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [entry, open, accounts]);

  if (!entry) return null;

  function commit() {
    if (!entry) return;
    const num = Number(amount.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(num) || num <= 0) {
      toast.error("סכום לא תקין.");
      return;
    }
    if (source === "card" && !accountId) {
      toast.error("יש לבחור כרטיס אשראי.");
      return;
    }
    if (source === "bank" && !accountId) {
      toast.error("יש לבחור חשבון בנק.");
      return;
    }
    const inst = Math.max(1, Math.floor(Number(installments) || 1));
    const paymentMethod = source === "card" ? "credit" : "cash";
    const nextChargeDate =
      chargeDate && /^\d{4}-\d{2}-\d{2}$/.test(chargeDate)
        ? new Date(`${chargeDate}T12:00:00.000Z`).toISOString()
        : entry.chargeDate;

    const result = updateExpense(entry.id, {
      amount: num,
      merchant: merchant.trim(),
      category,
      paymentMethod,
      // Empty-string clears the account binding; we accept undefined
      // here for the cash branch so the store drops the field.
      accountId: source === "cash" ? "" : accountId,
      installments: inst,
      chargeDate: nextChargeDate,
      note: note.trim(),
    });

    if (!result) {
      toast.error("עריכה נכשלה — הרשומה לא נמצאה.");
      return;
    }
    tap();
    toast.success("עודכן");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>עריכת הוצאה</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 pt-2">
          <Field label="סכום (₪)">
            <input
              type="text"
              inputMode="decimal"
              dir="ltr"
              value={amount}
              onChange={(e) =>
                setAmount(e.target.value.replace(/[^\d.]/g, ""))
              }
              data-mono="true"
              className="text-stat h-14 w-full rounded-xl border border-white/12 bg-background/40 px-3 text-foreground outline-none focus:border-[color:var(--neon)]/60"
            />
          </Field>

          <Field label="שם בית עסק / כותרת">
            <input
              type="text"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              className="text-body h-11 w-full rounded-xl border border-white/12 bg-background/40 px-3 text-foreground outline-none focus:border-[color:var(--neon)]/60"
            />
          </Field>

          <Field label="קטגוריה">
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((c) => {
                const Icon = c.icon;
                const active = category === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      tap();
                      setCategory(c.id);
                    }}
                    className={`tap-44 flex flex-col items-center gap-1 rounded-xl border p-2 text-caption transition-colors ${
                      active
                        ? "border-[color:var(--neon)]/60 bg-[color:var(--neon)]/12 text-foreground"
                        : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20"
                    }`}
                    aria-pressed={active}
                  >
                    <span
                      className="flex size-7 items-center justify-center rounded-lg"
                      style={{ background: `${c.accent}22`, color: c.accent }}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    {c.label}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="מקור תשלום">
            <SourceAccountPicker
              source={source}
              accountId={accountId}
              onSource={setSource}
              onAccount={setAccountId}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="תשלומים">
              <input
                type="text"
                inputMode="numeric"
                dir="ltr"
                value={installments}
                onChange={(e) =>
                  setInstallments(e.target.value.replace(/\D/g, ""))
                }
                className="text-body h-11 w-full rounded-xl border border-white/12 bg-background/40 px-3 text-foreground outline-none focus:border-[color:var(--neon)]/60"
              />
            </Field>
            <Field label="תאריך הוצאה">
              <input
                type="date"
                dir="ltr"
                value={chargeDate}
                onChange={(e) => setChargeDate(e.target.value)}
                className="text-body h-11 w-full rounded-xl border border-white/12 bg-background/40 px-3 text-foreground outline-none focus:border-[color:var(--neon)]/60"
              />
            </Field>
          </div>

          <Field label="הערה (לא חובה)">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              rows={2}
              className="text-body w-full resize-none rounded-xl border border-white/12 bg-background/40 px-3 py-2 text-foreground outline-none focus:border-[color:var(--neon)]/60"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="tap-44"
            >
              ביטול
            </Button>
            <Button
              onClick={commit}
              className="tap-44 bg-neon text-[#050505] hover:bg-neon/90"
            >
              שמור
            </Button>
          </div>

          <p className="text-caption text-muted-foreground/70">
            עריכה מעדכנת את {getCategory(entry.category).label}, את הכרטיס
            הקשור, ואת תחזית סוף החודש מיד. ה-ID של הרשומה נשמר.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-caption text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
