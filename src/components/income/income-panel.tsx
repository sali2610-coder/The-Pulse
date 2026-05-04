"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownToLine, Plus, Power, Trash2 } from "lucide-react";

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

type FormState = {
  label: string;
  amount: string;
  dayOfMonth: string;
};

const EMPTY: FormState = { label: "", amount: "", dayOfMonth: "1" };

export function IncomePanel() {
  const incomes = useFinanceStore((s) => s.incomes);
  const addIncome = useFinanceStore((s) => s.addIncome);
  const toggleIncome = useFinanceStore((s) => s.toggleIncome);
  const deleteIncome = useFinanceStore((s) => s.deleteIncome);

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  const monthly = incomes
    .filter((i) => i.active)
    .reduce((sum, i) => sum + i.amount, 0);

  const submit = () => {
    if (!form.label.trim() || !form.amount.trim()) return;
    addIncome({
      label: form.label,
      amount: Number(form.amount.replace(/,/g, "")),
      dayOfMonth: Number(form.dayOfMonth) || 1,
    });
    tap();
    setAdding(false);
    setForm(EMPTY);
  };

  return (
    <section className="space-y-3">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-foreground">הכנסות צפויות</div>
          <div className="text-[11px] text-muted-foreground">
            {incomes.length === 0
              ? "ללא הכנסות מוגדרות"
              : `סה"כ חודשי · ${formatILS(monthly)}`}
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
              <Label htmlFor="inc-label" className="mb-1.5 text-xs">
                שם
              </Label>
              <Input
                id="inc-label"
                placeholder='משכורת / שכר דירה'
                value={form.label}
                onChange={(e) =>
                  setForm((f) => ({ ...f, label: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="inc-amount" className="mb-1.5 text-xs">
                  סכום (₪)
                </Label>
                <Input
                  id="inc-amount"
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      amount: e.target.value.replace(/[^\d.]/g, ""),
                    }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="inc-day" className="mb-1.5 text-xs">
                  יום בחודש
                </Label>
                <Input
                  id="inc-day"
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
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setAdding(false);
                  setForm(EMPTY);
                }}
                className="h-9"
              >
                ביטול
              </Button>
              <Button
                type="submit"
                disabled={!form.label.trim() || !form.amount.trim()}
                className="h-9 bg-neon text-[#050505] hover:bg-neon/90 disabled:opacity-40"
              >
                הוסף
              </Button>
            </div>
          </motion.form>
        ) : null}
      </AnimatePresence>

      {incomes.length === 0 && !adding ? (
        <p className="rounded-xl border border-dashed border-border/40 px-3 py-6 text-center text-[11px] text-muted-foreground">
          הוסף הכנסה כדי שתוסף אוטומטית לתחזית EOM.
        </p>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {incomes.map((inc) => (
              <motion.li
                key={inc.id}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className={`rounded-2xl border p-3 ${
                  inc.active
                    ? "border-border/60 bg-surface/60"
                    : "border-border/40 bg-surface/30 opacity-60"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60 text-[#34D399]">
                    <ArrowDownToLine className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {inc.label}
                      </span>
                      <span
                        data-mono="true"
                        className="text-sm"
                        style={{ direction: "ltr", color: "#34D399" }}
                      >
                        +{formatILS(inc.amount)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      ב־{inc.dayOfMonth} בחודש
                    </div>
                    <div className="mt-2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleIncome(inc.id)}
                        className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-surface hover:text-foreground"
                      >
                        <Power className="size-3" />
                        {inc.active ? "כבה" : "הפעל"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`למחוק "${inc.label}"?`)) {
                            deleteIncome(inc.id);
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
