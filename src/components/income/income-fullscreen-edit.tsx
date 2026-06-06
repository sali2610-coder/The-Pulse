"use client";

// Phase 414 — Income Add+Edit fullscreen.

import { useState } from "react";
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
import { success as hapticSuccess } from "@/lib/haptics";
import type { Income } from "@/types/finance";

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

  const [label, setLabel] = useState(income?.label ?? "");
  const [amount, setAmount] = useState(
    income ? String(income.amount ?? 0) : "",
  );
  const [dayOfMonth, setDayOfMonth] = useState<number>(
    income?.dayOfMonth ?? 28,
  );

  const amountNumber = Number(amount || 0);
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
      </FullScreenBody>

      <FullScreenFooter
        primaryLabel={income ? "שמור שינויים" : "הוסף הכנסה"}
        onPrimary={handleSave}
        primaryDisabled={!canSave}
        destructiveLabel={income ? "מחק הכנסה" : undefined}
        onDestructive={income ? handleDelete : undefined}
      />
    </>
  );
}
