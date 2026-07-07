"use client";

// Income · Add/Edit sheet.
//
// Two writing surfaces in one form:
//
//   1. BASELINE (updateIncome / addIncome)
//        label, expected amount, day-of-month → the fixed
//        contract that every future month falls back to.
//
//   2. THIS-MONTH ACTUAL (setIncomeActual, current monthKey only)
//        Optional one-off amount that overrides the baseline
//        for the CURRENT month. Next month reverts to baseline
//        unless edited again. Same override mechanism the
//        forecast / liquidity curve / EOM projection consume.
//
// Save order: updateIncome first (which strips current+future
// overrides on baseline change), then setIncomeActual so the
// one-off write survives.

import { useMemo, useState } from "react";
import { HandCoins } from "lucide-react";
import { toast } from "sonner";

import {
  FieldRow,
  FullScreenBody,
  FullScreenEditShell,
  FullScreenFieldList,
  FullScreenFooter,
  FullScreenHero,
  FullScreenStepper,
} from "@/components/ui/full-screen-edit-shell";
import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { incomeForMonth } from "@/lib/income-month";
import { success as hapticSuccess } from "@/lib/haptics";
import type { Income } from "@/types/finance";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const MONTH_FMT = new Intl.DateTimeFormat("he-IL", {
  month: "long",
});

type Props = {
  incomeId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const TONE = "#FACC15";

export function IncomeFullScreenEdit({ incomeId, open, onOpenChange }: Props) {
  const income = useFinanceStore((s) =>
    incomeId ? s.incomes.find((i) => i.id === incomeId) ?? null : null,
  );
  const title = incomeId ? "עריכת הכנסה" : "הוספת הכנסה";
  return (
    <FullScreenEditShell open={open} onOpenChange={onOpenChange} title={title}>
      <EditBody
        key={incomeId ?? "new"}
        income={income}
        title={title}
        onOpenChange={onOpenChange}
      />
    </FullScreenEditShell>
  );
}

function EditBody({
  income,
  title,
  onOpenChange,
}: {
  income: Income | null;
  title: string;
  onOpenChange: (open: boolean) => void;
}) {
  const addIncome = useFinanceStore((s) => s.addIncome);
  const updateIncome = useFinanceStore((s) => s.updateIncome);
  const deleteIncome = useFinanceStore((s) => s.deleteIncome);
  const setIncomeActual = useFinanceStore((s) => s.setIncomeActual);

  const monthKey = currentMonthKey();
  const monthLabel = useMemo(() => {
    const [y, m] = monthKey.split("-").map(Number);
    return MONTH_FMT.format(new Date(y, m - 1, 1));
  }, [monthKey]);

  const [label, setLabel] = useState(income?.label ?? "");
  const [amount, setAmount] = useState(
    income ? String(income.amount ?? 0) : "",
  );
  const [dayOfMonth, setDayOfMonth] = useState<number>(
    income?.dayOfMonth ?? 28,
  );

  const overrideExisted = income?.actualByMonth?.[monthKey] !== undefined;
  const initialActual = income
    ? String(Math.round(incomeForMonth(income, monthKey)))
    : "";
  const [actual, setActual] = useState<string>(initialActual);

  const amountNumber = Number(amount || 0);
  const actualNumber = Number(actual || 0);
  const canSave = label.trim().length > 0 && amountNumber > 0;

  function handleSave() {
    if (!canSave) return;
    const payload = {
      label: label.trim(),
      amount: amountNumber,
      dayOfMonth,
    };
    if (income) {
      updateIncome(income.id, payload);
      // Persist one-off actual after baseline write (updateIncome
      // strips current+future overrides on amount change).
      if (income.active && actual.trim() !== "") {
        if (
          Number.isFinite(actualNumber) &&
          actualNumber >= 0 &&
          Math.abs(actualNumber - amountNumber) >= 0.5
        ) {
          setIncomeActual(income.id, monthKey, actualNumber);
        } else if (overrideExisted) {
          setIncomeActual(income.id, monthKey, null);
        }
      }
      toast.success("ההכנסה עודכנה");
    } else {
      addIncome(payload);
      toast.success("הכנסה נוספה");
    }
    hapticSuccess();
    onOpenChange(false);
  }

  function handleDelete() {
    if (!income) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`למחוק את "${income.label}"?`)
    ) {
      return;
    }
    deleteIncome(income.id);
    toast.success("ההכנסה נמחקה");
    onOpenChange(false);
  }

  function resetActualOverride() {
    if (!income) return;
    setIncomeActual(income.id, monthKey, null);
    setActual(String(Math.round(income.amount)));
    toast.success("השינוי החד-פעמי בוטל · חזר לצפי");
  }

  const actualPct =
    amountNumber > 0 && Number.isFinite(actualNumber) && actual.trim() !== ""
      ? Math.round((actualNumber / amountNumber) * 100)
      : null;
  const actualDelta =
    Number.isFinite(actualNumber) && actual.trim() !== ""
      ? actualNumber - amountNumber
      : 0;

  return (
    <>
      <FullScreenBody>
        <FullScreenHero
          icon={HandCoins}
          tone={TONE}
          label={title}
          amount={amount}
          onAmountChange={setAmount}
          amountLabel="סכום צפוי"
        />
        <FullScreenFieldList>
          <FieldRow label="מקור הכנסה" stacked>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={80}
              placeholder="משכורת / צד-משלח / פנסיה…"
              className="w-full rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-end text-[13.5px] text-foreground placeholder:text-muted-foreground/60 focus:border-white/16 focus:outline-none"
            />
          </FieldRow>
          <FieldRow label="יום החודש לקבלה">
            <FullScreenStepper
              value={dayOfMonth}
              onChange={setDayOfMonth}
              min={1}
              max={31}
            />
          </FieldRow>
        </FullScreenFieldList>

        {income ? (
          <div className="in-actual" dir="rtl">
            <div className="in-actual-head">
              <div className="in-actual-titles">
                <span className="in-actual-eyebrow">חד-פעמי · {monthLabel}</span>
                <span className="in-actual-title">בפועל התקבל החודש</span>
              </div>
              {overrideExisted ? (
                <button
                  type="button"
                  className="in-actual-reset"
                  onClick={resetActualOverride}
                  aria-label="בטל שינוי חד-פעמי לחודש הזה"
                >
                  בטל שינוי
                </button>
              ) : null}
            </div>
            <input
              type="text"
              inputMode="decimal"
              className="in-actual-input"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              dir="ltr"
              data-mono="true"
              placeholder={String(Math.round(amountNumber || 0))}
              aria-label="בפועל התקבל החודש"
            />
            {actualPct !== null && amountNumber > 0 ? (
              <div className="in-actual-metrics">
                <span
                  className="in-actual-pct"
                  data-tone={
                    actualPct >= 97 && actualPct <= 103
                      ? "safe"
                      : actualPct > 103
                        ? "safe"
                        : actualPct >= 50
                          ? "watch"
                          : "danger"
                  }
                >
                  {actualPct}% מהצפי
                </span>
                <span
                  className="in-actual-delta"
                  data-mono="true"
                  dir="ltr"
                  data-tone={actualDelta >= 0 ? "safe" : "danger"}
                >
                  {actualDelta >= 0 ? "+" : "−"}
                  {ILS.format(Math.round(Math.abs(actualDelta)))}
                </span>
              </div>
            ) : null}
            <p className="in-actual-note">
              שינוי כאן משפיע רק על החודש הזה. חודש הבא חוזר לצפי הקבוע.
            </p>
          </div>
        ) : null}
      </FullScreenBody>

      <FullScreenFooter
        primaryLabel={income ? "שמור שינויים" : "הוסף הכנסה"}
        onPrimary={handleSave}
        primaryDisabled={!canSave}
        disabledReason={
          !canSave
            ? [
                label.trim().length === 0 ? "מקור הכנסה" : null,
                amountNumber <= 0 ? "סכום צפוי" : null,
              ]
                .filter(Boolean)
                .join(" · ")
                .replace(/^/, "חסר: ")
            : undefined
        }
        cancelLabel="בטל"
        onCancel={() => onOpenChange(false)}
        destructiveLabel={income ? "מחק הכנסה" : undefined}
        onDestructive={income ? handleDelete : undefined}
      />
    </>
  );
}
