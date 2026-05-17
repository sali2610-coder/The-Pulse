"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Banknote, Plus, Power, Trash2 } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { tap } from "@/lib/haptics";
import { currentMonthKey } from "@/lib/dates";
import { loanSchedule } from "@/lib/installment-schedule";

const ILS_INT = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const formatILS = (value: number) => ILS_INT.format(value);
const MONTH_NAMES = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

type FormState = {
  label: string;
  monthlyInstallment: string;
  startMonth: string; // 1-12
  startYear: string;
  totalPayments: string;
  dayOfMonth: string;
};

function nowDefaults(): FormState {
  const d = new Date();
  return {
    label: "",
    monthlyInstallment: "",
    startMonth: String(d.getMonth() + 1),
    startYear: String(d.getFullYear()),
    totalPayments: "12",
    dayOfMonth: "1",
  };
}

export function LoansPanel() {
  const loans = useFinanceStore((s) => s.loans);
  const addLoan = useFinanceStore((s) => s.addLoan);
  const toggleLoan = useFinanceStore((s) => s.toggleLoan);
  const deleteLoan = useFinanceStore((s) => s.deleteLoan);

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(nowDefaults);

  const monthKey = currentMonthKey();
  const totalMonthly = loans
    .filter((l) => l.active && loanSchedule(l, monthKey).active)
    .reduce((sum, l) => sum + l.monthlyInstallment, 0);

  const submit = () => {
    if (!form.label.trim()) return;
    const monthly = Number(form.monthlyInstallment) || 0;
    const total = Math.max(1, Number(form.totalPayments) || 1);
    const startMonth = Math.min(12, Math.max(1, Number(form.startMonth) || 1));
    const startYear = Number(form.startYear) || new Date().getFullYear();
    addLoan({
      label: form.label.trim(),
      monthlyInstallment: monthly,
      // Auto-derive endDate so legacy consumers still get a value, plus
      // store the new shape so progress math works.
      endDate: new Date(
        startYear + Math.floor((startMonth - 1 + total - 1) / 12),
        ((startMonth - 1 + total - 1) % 12),
        1,
      ).toISOString(),
      remainingBalance: monthly * total,
      dayOfMonth: Math.min(31, Math.max(1, Number(form.dayOfMonth) || 1)),
      startMonth,
      startYear,
      totalPayments: total,
    });
    tap();
    setAdding(false);
    setForm(nowDefaults());
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
                  inputMode="decimal"
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
                <Label htmlFor="loan-total" className="mb-1.5 text-xs">
                  מספר תשלומים
                </Label>
                <Input
                  id="loan-total"
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  value={form.totalPayments}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      totalPayments: e.target.value.replace(/[^\d]/g, ""),
                    }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label htmlFor="loan-start-month" className="mb-1.5 text-xs">
                  חודש התחלה
                </Label>
                <select
                  id="loan-start-month"
                  value={form.startMonth}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, startMonth: e.target.value }))
                  }
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm text-foreground outline-none"
                >
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={idx} value={idx + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="loan-start-year" className="mb-1.5 text-xs">
                  שנה
                </Label>
                <Input
                  id="loan-start-year"
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  maxLength={4}
                  value={form.startYear}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      startYear: e.target.value.replace(/[^\d]/g, "").slice(0, 4),
                    }))
                  }
                />
              </div>
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
            </div>
            <p className="text-[11px] text-muted-foreground">
              תאריך הסיום מחושב אוטומטית מתוך חודש ההתחלה + מספר התשלומים.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setAdding(false);
                  setForm(nowDefaults());
                }}
                className="h-9"
              >
                ביטול
              </Button>
              <Button
                type="submit"
                disabled={!form.label.trim()}
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
            {loans.map((loan) => {
              const sched = loanSchedule(loan, monthKey);
              const total = loan.totalPayments;
              const paid = sched.paymentNumber ?? 0;
              const pct = total ? Math.min(100, (paid / total) * 100) : 0;
              const remainingAmount =
                total && sched.remaining !== undefined
                  ? sched.remaining * loan.monthlyInstallment
                  : loan.remainingBalance ?? 0;
              return (
                <motion.li
                  key={loan.id}
                  layout
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  className={`overflow-hidden rounded-2xl border p-3 ${
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
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        {total && paid > 0 ? (
                          <span data-mono="true">
                            תשלום {paid}/{total}
                          </span>
                        ) : null}
                        {sched.remaining !== undefined ? (
                          <>
                            <span>·</span>
                            <span>נותרו {sched.remaining} תשלומים</span>
                          </>
                        ) : null}
                        <span>·</span>
                        <span>
                          סה״כ נותר {formatILS(remainingAmount)}
                        </span>
                        <span>·</span>
                        <span>ב־{loan.dayOfMonth} בחודש</span>
                        {sched.endMonthKey ? (
                          <>
                            <span>·</span>
                            <span dir="ltr">סוף · {sched.endMonthKey}</span>
                          </>
                        ) : null}
                      </div>
                      {total ? (
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.6, ease: "easeOut" }}
                            className="h-full rounded-full"
                            style={{
                              background:
                                "linear-gradient(90deg, #D4AF37, #D4AF3766)",
                            }}
                          />
                        </div>
                      ) : null}
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
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
