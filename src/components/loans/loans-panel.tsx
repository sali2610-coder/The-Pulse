"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Banknote, Plus, Power, Trash2 } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { tap } from "@/lib/haptics";

const formatILS = (value: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value);

const dateFormatter = new Intl.DateTimeFormat("he-IL", {
  month: "short",
  year: "2-digit",
});

type FormState = {
  label: string;
  monthlyInstallment: string;
  remainingBalance: string;
  endDate: string;
  dayOfMonth: string;
};

const EMPTY_FORM: FormState = {
  label: "",
  monthlyInstallment: "",
  remainingBalance: "",
  endDate: "",
  dayOfMonth: "1",
};

export function LoansPanel() {
  const loans = useFinanceStore((s) => s.loans);
  const addLoan = useFinanceStore((s) => s.addLoan);
  const toggleLoan = useFinanceStore((s) => s.toggleLoan);
  const deleteLoan = useFinanceStore((s) => s.deleteLoan);

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const totalMonthly = loans
    .filter((l) => l.active)
    .reduce((sum, l) => sum + l.monthlyInstallment, 0);

  const submit = () => {
    if (!form.label.trim() || !form.endDate) return;
    addLoan({
      label: form.label,
      monthlyInstallment: Number(form.monthlyInstallment) || 0,
      remainingBalance: Number(form.remainingBalance) || 0,
      endDate: new Date(form.endDate).toISOString(),
      dayOfMonth: Number(form.dayOfMonth) || 1,
    });
    tap();
    setAdding(false);
    setForm(EMPTY_FORM);
  };

  return (
    <section className="space-y-3">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-foreground">הלוואות</div>
          <div className="text-[11px] text-muted-foreground">
            {loans.length === 0
              ? "ללא הלוואות פעילות"
              : `סה"כ חודשי פעיל · ${formatILS(totalMonthly)}`}
          </div>
        </div>
        {!adding ? (
          <button
            type="button"
            onClick={() => {
              tap();
              setAdding(true);
            }}
            className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-neon/50 hover:text-foreground"
          >
            <Plus className="size-3.5 text-neon" />
            חדש
          </button>
        ) : null}
      </header>

      <AnimatePresence>
        {adding ? (
          <motion.form
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="space-y-3 rounded-2xl border border-border/60 bg-surface/60 p-4"
          >
            <div>
              <Label htmlFor="loan-label" className="mb-1.5 text-xs">
                שם
              </Label>
              <Input
                id="loan-label"
                placeholder="הלוואת רכב / משכנתא"
                value={form.label}
                onChange={(e) =>
                  setForm((f) => ({ ...f, label: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="loan-installment" className="mb-1.5 text-xs">
                  תשלום חודשי (₪)
                </Label>
                <Input
                  id="loan-installment"
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  value={form.monthlyInstallment}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      monthlyInstallment: e.target.value.replace(/[^\d.]/g, ""),
                    }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="loan-remaining" className="mb-1.5 text-xs">
                  יתרה (₪)
                </Label>
                <Input
                  id="loan-remaining"
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  value={form.remainingBalance}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      remainingBalance: e.target.value.replace(/[^\d.]/g, ""),
                    }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="loan-day" className="mb-1.5 text-xs">
                  יום בחודש
                </Label>
                <Input
                  id="loan-day"
                  type="number"
                  min={1}
                  max={31}
                  dir="ltr"
                  value={form.dayOfMonth}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, dayOfMonth: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="loan-end" className="mb-1.5 text-xs">
                  תאריך סיום
                </Label>
                <Input
                  id="loan-end"
                  type="date"
                  value={form.endDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, endDate: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setAdding(false);
                  setForm(EMPTY_FORM);
                }}
                className="h-9"
              >
                ביטול
              </Button>
              <Button
                type="submit"
                disabled={!form.label.trim() || !form.endDate}
                className="h-9 bg-neon text-[#050505] hover:bg-neon/90 disabled:opacity-40"
              >
                הוסף
              </Button>
            </div>
          </motion.form>
        ) : null}
      </AnimatePresence>

      {loans.length === 0 && !adding ? (
        <p className="rounded-xl border border-dashed border-border/40 px-3 py-6 text-center text-[11px] text-muted-foreground">
          הוסף הלוואה כדי שתוקטן אוטומטית מהתחזית בכל חודש.
        </p>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {loans.map((loan) => (
              <motion.li
                key={loan.id}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className={`rounded-2xl border p-3 ${
                  loan.active
                    ? "border-border/60 bg-surface/60"
                    : "border-border/40 bg-surface/30 opacity-60"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60 text-gold">
                    <Banknote className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {loan.label}
                      </span>
                      <span
                        data-mono="true"
                        className="text-sm text-foreground"
                        style={{ direction: "ltr" }}
                      >
                        {formatILS(loan.monthlyInstallment)} / חודש
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>נותרו {formatILS(loan.remainingBalance)}</span>
                      <span>·</span>
                      <span>סוף · {dateFormatter.format(new Date(loan.endDate))}</span>
                      <span>·</span>
                      <span>ב־{loan.dayOfMonth} בחודש</span>
                    </div>
                    <div className="mt-2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleLoan(loan.id)}
                        className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-surface hover:text-foreground"
                      >
                        <Power className="size-3" />
                        {loan.active ? "כבה" : "הפעל"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`למחוק "${loan.label}"?`)) {
                            deleteLoan(loan.id);
                          }
                        }}
                        className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-destructive/80 hover:bg-destructive/10"
                      >
                        <Trash2 className="size-3" />
                        מחק
                      </button>
                    </div>
                  </div>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
