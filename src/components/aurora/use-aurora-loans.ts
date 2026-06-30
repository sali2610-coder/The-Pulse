"use client";

// Phase 443 · AURORA recovery — Loans engine reader
//
// Composes the same Loan rows the legacy Loans / Obligations cockpit
// read, via buildObligationsOverview. UI-only. No engine math.

import { useMemo } from "react";

import { addMonths, currentMonthKey, monthIndex } from "@/lib/dates";
import { buildObligationsOverview } from "@/lib/obligations-overview";
import { useFinanceStore } from "@/lib/store";
import type { Loan } from "@/types/finance";

export type AuroraLoanRow = {
  id: string;
  label: string;
  monthlyAmount: number;
  monthlyInstallment: number;
  remainingPayments?: number;
  paidPayments?: number;
  totalPayments?: number;
  paymentLabel?: string;
  progress: number; // 0..1
  nextChargeDate: string;
  nextChargeDay: number;
  status: "active" | "starting-soon" | "ending-soon";
  endMonthKey?: string;
  endLabel?: string;
  originalAmount?: number;
  remainingBalance?: number;
  paidBalance?: number;
  isLegacyRemaining: boolean;
  active: boolean;
};

export type AuroraLoansData = {
  ready: boolean;
  isDemo: boolean;
  monthLabel: string;
  totalMonthly: number;
  totalRemaining: number;
  totalOriginal: number;
  paidSoFar: number;
  activeCount: number;
  totalProgress: number;
  rows: AuroraLoanRow[];
};

const HEBREW_MONTH = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

const EMPTY: AuroraLoansData = {
  ready: false,
  isDemo: false,
  monthLabel: "—",
  totalMonthly: 0,
  totalRemaining: 0,
  totalOriginal: 0,
  paidSoFar: 0,
  activeCount: 0,
  totalProgress: 0,
  rows: [],
};

function endMonthLabel(monthKey: string | undefined): string | undefined {
  if (!monthKey) return undefined;
  const [y, m] = monthKey.split("-").map(Number);
  return `${HEBREW_MONTH[(m ?? 1) - 1]} ${y}`;
}

function originalAmount(loan: Loan): number | undefined {
  if (loan.totalPayments && loan.totalPayments > 0) {
    return loan.totalPayments * loan.monthlyInstallment;
  }
  return undefined;
}

export function useAuroraLoans(): AuroraLoansData {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const rules = useFinanceStore((s) => s.rules);

  return useMemo<AuroraLoansData>(() => {
    if (!hydrated) return EMPTY;

    const monthKey = currentMonthKey();
    const [year, mIdx] = monthKey.split("-").map(Number);
    const monthLabel = `${HEBREW_MONTH[(mIdx ?? 1) - 1]} ${year}`;

    if (loans.length === 0) {
      return { ...EMPTY, ready: true, monthLabel };
    }

    const obligations = buildObligationsOverview({
      loans,
      rules,
      accounts,
      monthKey,
      now: new Date(),
    });

    let totalRemaining = 0;
    let totalOriginal = 0;
    let paidSoFar = 0;
    let activeCount = 0;

    const rows: AuroraLoanRow[] = obligations.loans.map((row) => {
      const loan = row.loan;
      const orig = originalAmount(loan);
      const remainingPayments = row.remainingPayments;
      const total = loan.totalPayments;
      const paid =
        total !== undefined && remainingPayments !== undefined
          ? Math.max(0, total - remainingPayments)
          : undefined;
      const progress =
        total !== undefined && paid !== undefined && total > 0
          ? Math.max(0, Math.min(1, paid / total))
          : 0;

      // ₪ remaining balance — prefer derived (totalPayments × instalment
      // − paid × instalment). Falls back to the legacy field when no
      // schedule data exists.
      let derivedRemaining: number | undefined;
      let isLegacyRemaining = false;
      if (remainingPayments !== undefined) {
        derivedRemaining = remainingPayments * loan.monthlyInstallment;
      } else if (typeof loan.remainingBalance === "number") {
        derivedRemaining = loan.remainingBalance;
        isLegacyRemaining = true;
      }
      const paidBalance =
        orig !== undefined && derivedRemaining !== undefined
          ? Math.max(0, orig - derivedRemaining)
          : undefined;

      if (loan.active) activeCount += 1;
      if (derivedRemaining !== undefined) totalRemaining += derivedRemaining;
      if (orig !== undefined) totalOriginal += orig;
      if (paidBalance !== undefined) paidSoFar += paidBalance;

      return {
        id: loan.id,
        label: loan.label,
        monthlyAmount: Math.round(row.monthlyAmount),
        monthlyInstallment: loan.monthlyInstallment,
        remainingPayments,
        paidPayments: paid,
        totalPayments: total,
        paymentLabel: row.paymentLabel,
        progress,
        nextChargeDate: row.nextChargeDate.toISOString(),
        nextChargeDay: row.nextChargeDate.getDate(),
        status: row.status,
        endMonthKey: row.endMonthKey,
        endLabel: endMonthLabel(row.endMonthKey),
        originalAmount: orig !== undefined ? Math.round(orig) : undefined,
        remainingBalance:
          derivedRemaining !== undefined
            ? Math.round(derivedRemaining)
            : undefined,
        paidBalance: paidBalance !== undefined ? Math.round(paidBalance) : undefined,
        isLegacyRemaining,
        active: loan.active,
      };
    });

    // Stable sort — endings-first when imminent, then by monthly amount.
    rows.sort((a, b) => {
      const aSoon = a.status === "ending-soon" ? 0 : 1;
      const bSoon = b.status === "ending-soon" ? 0 : 1;
      if (aSoon !== bSoon) return aSoon - bSoon;
      return b.monthlyAmount - a.monthlyAmount;
    });

    const totalMonthly = Math.round(obligations.loansMonthly);
    const totalProgress =
      totalOriginal > 0
        ? Math.max(0, Math.min(1, paidSoFar / totalOriginal))
        : 0;

    // Suppress monthIndex unused warning — kept import for parity with
    // legacy reader and to assert a stable key during sorting.
    void monthIndex;
    void addMonths;

    return {
      ready: true,
      isDemo: false,
      monthLabel,
      totalMonthly,
      totalRemaining: Math.round(totalRemaining),
      totalOriginal: Math.round(totalOriginal),
      paidSoFar: Math.round(paidSoFar),
      activeCount,
      totalProgress,
      rows,
    };
  }, [hydrated, accounts, loans, rules]);
}
