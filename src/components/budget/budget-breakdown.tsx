"use client";

// Phase 323 — shared "תקציב פנוי עד המשכורת" breakdown panel.
//
// Single rendering surface for the 6-line decomposition produced by
// buildBudgetControlBreakdown. Used by Settings → בקרת תקציב and the
// Home → "כמה נשאר לי לבזבז" headline so both numbers come from the
// same place and the user never sees a clamped or stale value.

import type { BudgetControlBreakdown } from "@/lib/budget-control";

import { formatCurrencyAmount } from "@/lib/money";
const ILS = { format: (v: number) => formatCurrencyAmount(v) };

const fmt = (n: number) => {
  const r = Math.round(n);
  const sign = r > 0 ? "+" : r < 0 ? "−" : "";
  return `${sign}${ILS.format(Math.abs(r))}`;
};

export function BudgetBreakdownPanel({
  breakdown,
  /** When false the panel renders the muted "חסר מידע" notice instead
   *  of numbers, regardless of the breakdown's internal values. */
  trusted,
}: {
  breakdown: BudgetControlBreakdown;
  trusted: boolean;
}) {
  if (!trusted) {
    return (
      <p className="rounded-2xl border border-white/10 bg-black/40 p-3 text-[11.5px] text-muted-foreground">
        חסר מידע לחישוב מדויק. הגדר לפחות חשבון בנק אחד עם יתרה נוכחית
        ב״חשבונות״ כדי שהמספר ייהפך לאמין.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5 rounded-2xl border border-white/8 bg-black/20 p-3 text-[12px]">
      <BreakdownRow
        label="יתרה בבנק"
        value={breakdown.bankBalance}
        negativeIsBad
      />
      <BreakdownRow
        label="הכנסות צפויות"
        value={breakdown.expectedIncomeUntilCycle}
        forcePositive
      />
      <BreakdownRow
        label="חיובים קבועים שעוד ירדו"
        value={-breakdown.pendingFixedUntilCycle}
      />
      <BreakdownRow
        label="הלוואות שעוד ירדו"
        value={-breakdown.pendingLoansUntilCycle}
      />
      <BreakdownRow
        label="אשראי צפוי"
        value={-breakdown.pendingCardUntilCycle}
      />
      <BreakdownRow label="כרית ביטחון" value={-breakdown.safetyBuffer} />
      <li
        className="mt-1 flex items-center justify-between border-t border-white/10 pt-1.5 text-[12.5px] font-medium"
        style={{
          color: breakdown.available < 0 ? "#F87171" : "#34D399",
        }}
      >
        <span>תוצאה</span>
        <span data-mono="true" dir="ltr">
          {fmt(breakdown.available)}
        </span>
      </li>
    </ul>
  );
}

export function BudgetNegativeBanner({
  available,
}: {
  available: number;
}) {
  return (
    <p className="rounded-xl border border-[#F87171]/30 bg-[#F87171]/10 p-2 text-[11.5px] text-[#F87171]">
      אין תקציב פנוי. צפוי מינוס של {fmt(available)} עד המשכורת
      הבאה. שקול לדחות חיוב, להזרים הכנסה נוספת או לעדכן את כרית
      הביטחון.
    </p>
  );
}

function BreakdownRow({
  label,
  value,
  negativeIsBad = false,
  forcePositive = false,
}: {
  label: string;
  value: number;
  negativeIsBad?: boolean;
  forcePositive?: boolean;
}) {
  const rounded = Math.round(value);
  const color = forcePositive
    ? rounded > 0
      ? "#34D399"
      : "rgba(255,255,255,0.55)"
    : negativeIsBad && rounded < 0
      ? "#F87171"
      : rounded < 0
        ? "#F87171"
        : rounded > 0
          ? "#34D399"
          : "rgba(255,255,255,0.55)";
  return (
    <li className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span data-mono="true" dir="ltr" style={{ color }}>
        {fmt(value)}
      </span>
    </li>
  );
}
