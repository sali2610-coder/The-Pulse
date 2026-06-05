"use client";

// Phase 371 — Financial Debug Panel.
//
// Dev-only. Never rendered in production. Surfaces every canonical
// monthly aggregate side-by-side so a future audit can verify every
// surface still agrees with the engine:
//
//   Total monthly obligation (cockpit)
//   Credit card exposure (canonical)
//   Snapshot recurringCommitments
//   Snapshot fixedExpenses + loans
//
// No tap targets, no animations. Just numbers.

import { useMemo } from "react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { getMonthlyObligationBreakdown } from "@/lib/monthly-obligation-breakdown";
import { getCreditCardExposure } from "@/lib/credit-card-exposure";
import { buildFinancialSnapshot } from "@/lib/financial-snapshot";
import { buildDailyBudgetView } from "@/lib/daily-budget-view";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export function FinancialDebugPanel() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const rules = useFinanceStore((s) => s.rules);
  const loans = useFinanceStore((s) => s.loans);
  const entries = useFinanceStore((s) => s.entries);
  const statuses = useFinanceStore((s) => s.statuses);
  const accounts = useFinanceStore((s) => s.accounts);
  const incomes = useFinanceStore((s) => s.incomes);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  const data = useMemo(() => {
    if (!hydrated) return null;
    const monthKey = currentMonthKey();
    const obligations = getMonthlyObligationBreakdown({
      rules,
      loans,
      entries,
      statuses,
      monthKey,
    });
    const exposure = getCreditCardExposure({
      rules,
      entries,
      statuses,
      monthKey,
    });
    const snap = buildFinancialSnapshot({
      accounts,
      loans,
      incomes,
      entries,
      rules,
      statuses,
      monthlyBudget,
      monthKey,
    });
    const view = buildDailyBudgetView({
      accounts,
      loans,
      incomes,
      entries,
      rules,
      statuses,
    });
    return { obligations, exposure, snap, view, monthKey };
  }, [
    hydrated,
    rules,
    loans,
    entries,
    statuses,
    accounts,
    incomes,
    monthlyBudget,
  ]);

  if (!data) return null;

  const { obligations, exposure, snap, view, monthKey } = data;

  return (
    <details
      className="mx-auto mt-6 w-full max-w-md rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/[0.04] text-fuchsia-200/90"
      dir="rtl"
    >
      <summary className="cursor-pointer px-3 py-2 text-[11px] uppercase tracking-[0.22em]">
        Financial Debug · {monthKey}
      </summary>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-3 py-2 text-[11px]">
        <Row label="Cockpit · Total" value={obligations.total} />
        <Row label="Cockpit · Credit" value={obligations.creditCardsTotal} />
        <Row label="Cockpit · Bank" value={obligations.bankFixedTotal} />
        <Row label="Cockpit · Loans" value={obligations.loansTotal} />
        <Row label="Cockpit · Cash" value={obligations.cashTotal} />
        <Row label="Cockpit · dupes prevented" value={obligations.duplicatesPrevented} raw />
        <Row label="Exposure · Future rules" value={exposure.futureCardCharges} />
        <Row label="Exposure · Existing inst." value={exposure.existingInstallments} />
        <Row label="Exposure · Wallet" value={exposure.walletTransactions} />
        <Row label="Exposure · Imported" value={exposure.importedTransactions} />
        <Row label="Exposure · Manual" value={exposure.manualCardTransactions} />
        <Row label="Exposure · Pending" value={exposure.pendingTransactions} />
        <Row label="Exposure · Total" value={exposure.totalExpectedCharge} />
        <Row label="Snapshot · recurring" value={snap.recurringCommitmentsUntilNextMonth} />
        <Row label="Snapshot · fixed" value={snap.fixedExpensesUntilNextMonth} />
        <Row label="Snapshot · loans" value={snap.activeLoansPaymentsUntilNextMonth} />
        <Row label="Daily · current bank" value={view.currentBankBalance} />
        <Row label="Daily · forecast @ 10th next" value={view.forecastBankAtAnchor} />
        <Row label="Daily · expected income" value={view.expectedIncome} />
        <Row label="Daily · total commitments" value={view.totalCommitments} />
        <Row label="Daily · income − commitments" value={view.monthlyFreeBalance} />
        <Row label="Daily · real available" value={view.realAvailable} />
        <Row label="Daily · spent today" value={view.spentToday} />
        <Row label="Daily · per day" value={view.perDay} />
        <Row label="Daily · deficit" value={view.deficit} />
        <Row label="Daily · anchor offset (days)" value={view.anchorOffset} raw />
      </div>
      <p className="px-3 pb-2 text-[10px] opacity-70">
        Dev-only. Renders only when NODE_ENV !== &quot;production&quot;.
      </p>
    </details>
  );
}

function Row({
  label,
  value,
  raw,
}: {
  label: string;
  value: number;
  raw?: boolean;
}) {
  return (
    <>
      <span className="opacity-80">{label}</span>
      <span
        data-mono="true"
        dir="ltr"
        className="text-end font-medium"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {raw ? value : ILS.format(value)}
      </span>
    </>
  );
}
