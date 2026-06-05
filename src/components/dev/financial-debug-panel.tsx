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
import { buildCashFlowBuckets } from "@/lib/cash-flow-bucket";

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
    // Phase 390 — cross-surface delta detector. Σ buckets.card
    // monthlyTotal (35-day window) must equal exposure −
    // pendingTransactions. Anything else is a regression and we
    // surface it in red.
    const buckets = buildCashFlowBuckets({
      accounts,
      loans,
      rules,
      statuses,
      entries,
      windowDays: 35,
    });
    const cardBucketsTotal = buckets.buckets
      .filter((b) => b.source === "card")
      .reduce((s, b) => s + b.monthlyTotal, 0);
    const expectedCurveCredit =
      exposure.totalExpectedCharge - exposure.pendingTransactions;
    const delta = Math.round(cardBucketsTotal - expectedCurveCredit);
    return {
      obligations,
      exposure,
      snap,
      view,
      monthKey,
      cardBucketsTotal: Math.round(cardBucketsTotal),
      expectedCurveCredit: Math.round(expectedCurveCredit),
      delta,
    };
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

  const {
    obligations,
    exposure,
    snap,
    view,
    monthKey,
    cardBucketsTotal,
    expectedCurveCredit,
    delta,
  } = data;
  const mismatch = Math.abs(delta) > 1;

  return (
    <details
      className="mx-auto mt-6 w-full max-w-md rounded-2xl border text-fuchsia-200/90"
      dir="rtl"
      style={{
        borderColor: mismatch
          ? "rgba(248,113,113,0.65)"
          : "rgba(217,70,239,0.3)",
        background: mismatch
          ? "rgba(248,113,113,0.07)"
          : "rgba(217,70,239,0.04)",
      }}
    >
      <summary
        className="cursor-pointer px-3 py-2 text-[11px] uppercase tracking-[0.22em]"
        style={{ color: mismatch ? "#FCA5A5" : undefined }}
      >
        Financial Debug · {monthKey}
        {mismatch ? " · MISMATCH" : " · OK"}
      </summary>
      {mismatch ? (
        <p className="px-3 py-2 text-[11px] text-red-200">
          Curve card-buckets total ≠ exposure − pending. Delta{" "}
          {ILS.format(delta)}. Something is calculating credit
          locally. Open tests/engine-parity.test.ts.
        </p>
      ) : null}
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
        <Row label="Parity · curve card buckets" value={cardBucketsTotal} />
        <Row label="Parity · expected (exposure − pending)" value={expectedCurveCredit} />
        <Row label="Parity · delta" value={delta} />
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
