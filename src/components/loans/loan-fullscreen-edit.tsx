"use client";

// Phase 409 — Loan Add / Edit, full-screen premium experience.
//
// First pilot consuming the shared FullScreenEditShell primitives
// extracted from expense-edit-fullscreen.tsx. Same DNA: huge hero
// icon, hero amount, divided field list, gold-pill segmented
// controls, sticky footer with primary CTA + destructive secondary.
//
// Engine math untouched. Talks to store.addLoan / updateLoan /
// deleteLoan exactly the way the legacy inline panel did.

import { useMemo, useState } from "react";
import { Banknote } from "lucide-react";
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
import { tap as hapticTap, success as hapticSuccess } from "@/lib/haptics";
import type { Loan } from "@/types/finance";

type Props = {
  loanId: string | null;
  /** When loanId is null, the component runs in "add" mode and
   *  resets to defaults on open. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const TONE = "#A78BFA";
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

export function LoanFullScreenEdit({ loanId, open, onOpenChange }: Props) {
  const loan = useFinanceStore((s) =>
    loanId ? s.loans.find((l) => l.id === loanId) ?? null : null,
  );
  const title = loanId ? "עריכת הלוואה" : "הוספת הלוואה";

  return (
    <FullScreenEditShell open={open} onOpenChange={onOpenChange} title={title}>
      {/* Key remount per loan id so each row seeds its own state. */}
      <EditBody
        key={loanId ?? "new"}
        loan={loan}
        title={title}
        onOpenChange={onOpenChange}
      />
    </FullScreenEditShell>
  );
}

function EditBody({
  loan,
  title,
  onOpenChange,
}: {
  loan: Loan | null;
  title: string;
  onOpenChange: (open: boolean) => void;
}) {
  const addLoan = useFinanceStore((s) => s.addLoan);
  const updateLoan = useFinanceStore((s) => s.updateLoan);
  const deleteLoan = useFinanceStore((s) => s.deleteLoan);

  const now = useMemo(() => new Date(), []);
  const [label, setLabel] = useState(loan?.label ?? "");
  const [amount, setAmount] = useState(
    loan ? String(loan.monthlyInstallment ?? 0) : "",
  );
  const [principal, setPrincipal] = useState<string>(
    loan?.principalAmount !== undefined ? String(loan.principalAmount) : "",
  );
  const [dayOfMonth, setDayOfMonth] = useState<number>(loan?.dayOfMonth ?? 1);
  const [totalPayments, setTotalPayments] = useState<number>(
    loan?.totalPayments ?? 24,
  );
  const [startMonth, setStartMonth] = useState<number>(
    loan?.startMonth ?? now.getMonth() + 1,
  );
  const [startYear, setStartYear] = useState<number>(
    loan?.startYear ?? now.getFullYear(),
  );

  const monthly = Number(amount || 0);
  const principalNumber = Number(principal || 0);
  const canSave = label.trim().length > 0 && monthly > 0 && dayOfMonth > 0;

  // Auto-derived summary — reads from current draft inputs so the
  // user sees the arithmetic in real time before saving. Purely
  // display; store persists monthlyInstallment × totalPayments as
  // the schedule and principalAmount as an optional display field.
  const totalRepay = monthly * (totalPayments || 0);
  const interestCost =
    principalNumber > 0 ? Math.max(0, totalRepay - principalNumber) : 0;
  const monthlyInterest =
    totalPayments > 0 ? Math.round(interestCost / totalPayments) : 0;

  function handleSave() {
    if (!canSave) return;
    const principalPatch =
      principalNumber > 0 ? { principalAmount: principalNumber } : {};
    if (loan) {
      updateLoan(loan.id, {
        label: label.trim(),
        monthlyInstallment: monthly,
        dayOfMonth,
        startMonth,
        startYear,
        totalPayments,
        ...principalPatch,
      });
      toast.success("ההלוואה עודכנה");
    } else {
      addLoan({
        label: label.trim(),
        monthlyInstallment: monthly,
        dayOfMonth,
        startMonth,
        startYear,
        totalPayments,
        ...principalPatch,
      });
      toast.success("הלוואה נוספה");
    }
    hapticSuccess();
    onOpenChange(false);
  }

  function handleDelete() {
    if (!loan) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`למחוק את "${loan.label}"?`)
    ) {
      return;
    }
    deleteLoan(loan.id);
    toast.success("ההלוואה נמחקה");
    onOpenChange(false);
  }

  return (
    <>
      <FullScreenBody>
        <FullScreenHero
          icon={Banknote}
          tone={TONE}
          label={title}
          amount={amount}
          onAmountChange={setAmount}
          amountLabel="תשלום חודשי"
        />

        <FullScreenFieldList>
          <FieldRow label="שם ההלוואה" stacked>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={80}
              placeholder="משכנתא / רכב / עסקי…"
              className="w-full rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-end text-[13.5px] text-foreground placeholder:text-muted-foreground/60 focus:border-white/16 focus:outline-none"
            />
          </FieldRow>

          <FieldRow label="יום החודש לחיוב">
            <FullScreenStepper
              value={dayOfMonth}
              onChange={(n) => {
                hapticTap();
                setDayOfMonth(n);
              }}
              min={1}
              max={31}
              ariaLabel="יום בחודש"
            />
          </FieldRow>

          <FieldRow label="סכום שלקחתי בפועל" stacked>
            <input
              type="number"
              inputMode="decimal"
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
              min={0}
              step={100}
              placeholder="₪ קרן ההלוואה (ללא ריבית)"
              className="w-full rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-end text-[13.5px] text-foreground placeholder:text-muted-foreground/60 focus:border-white/16 focus:outline-none"
              dir="ltr"
            />
          </FieldRow>

          <FieldRow label="מספר תשלומים">
            <FullScreenStepper
              value={totalPayments}
              onChange={(n) => {
                hapticTap();
                setTotalPayments(n);
              }}
              min={1}
              max={360}
              ariaLabel="סה״כ תשלומים"
            />
          </FieldRow>

          <FieldRow label="חודש התחלה">
            <select
              value={startMonth}
              onChange={(e) => setStartMonth(Number(e.target.value))}
              className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[13px] text-foreground focus:border-white/20 focus:outline-none"
              dir="rtl"
            >
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </FieldRow>

          <FieldRow label="שנת התחלה">
            <input
              type="number"
              value={startYear}
              onChange={(e) => setStartYear(Number(e.target.value))}
              min={2000}
              max={2100}
              className="w-20 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-end text-[13px] text-foreground focus:border-white/20 focus:outline-none"
              dir="ltr"
            />
          </FieldRow>
        </FullScreenFieldList>

        {monthly > 0 && totalPayments > 0 ? (
          <div className="ln-derived" dir="rtl" aria-label="חישוב אוטומטי">
            <div className="ln-derived-title">חישוב אוטומטי</div>
            <div className="ln-derived-grid">
              <div className="ln-derived-cell">
                <span className="ln-derived-label">סה״כ תשלום</span>
                <span className="ln-derived-value" data-mono="true" dir="ltr">
                  ₪ {Math.round(totalRepay).toLocaleString("he-IL")}
                </span>
              </div>
              <div className="ln-derived-cell">
                <span className="ln-derived-label">
                  {principalNumber > 0 ? "ריבית כוללת" : "ריבית — הזן קרן"}
                </span>
                <span className="ln-derived-value" data-mono="true" dir="ltr">
                  {principalNumber > 0
                    ? `₪ ${Math.round(interestCost).toLocaleString("he-IL")}`
                    : "—"}
                </span>
              </div>
              <div className="ln-derived-cell">
                <span className="ln-derived-label">ריבית משוערת לחודש</span>
                <span className="ln-derived-value" data-mono="true" dir="ltr">
                  {principalNumber > 0
                    ? `₪ ${monthlyInterest.toLocaleString("he-IL")}`
                    : "—"}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </FullScreenBody>

      <FullScreenFooter
        primaryLabel={loan ? "שמור שינויים" : "הוסף הלוואה"}
        onPrimary={handleSave}
        primaryDisabled={!canSave}
        destructiveLabel={loan ? "מחק הלוואה" : undefined}
        onDestructive={loan ? handleDelete : undefined}
      />
    </>
  );
}
