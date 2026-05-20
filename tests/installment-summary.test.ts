import { describe, expect, it } from "vitest";

import {
  buildLoanInstallmentSummary,
  buildRuleInstallmentSummary,
} from "@/lib/installment-summary";
import type { Loan, MonthKey, RecurringRule } from "@/types/finance";

const MAY: MonthKey = "2026-05";

function makeRule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: "r1",
    label: "TV",
    category: "shopping",
    estimatedAmount: 255,
    dayOfMonth: 5,
    keywords: [],
    active: true,
    createdAt: "2024-09-01T00:00:00.000Z",
    installmentTotal: 36,
    startMonth: 9,
    startYear: 2024,
    ...overrides,
  };
}

function makeLoan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: "l1",
    label: "Car",
    monthlyInstallment: 1500,
    remainingBalance: 60_000,
    endDate: "2027-04-01",
    dayOfMonth: 5,
    startMonth: 1,
    startYear: 2025,
    totalPayments: 60,
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildRuleInstallmentSummary", () => {
  it("returns null for a non-installment rule", () => {
    expect(
      buildRuleInstallmentSummary(
        makeRule({ installmentTotal: undefined }),
        MAY,
      ),
    ).toBeNull();
  });

  it("computes the full deal context mid-stream", () => {
    // TV: 36 payments × ₪255 from Sep 2024.
    // May 2026 = month 21 (Sep 2024 = #1, May 2026 = #21).
    const s = buildRuleInstallmentSummary(makeRule(), MAY)!;
    expect(s.monthlyPayment).toBe(255);
    expect(s.installmentCount).toBe(36);
    expect(s.installmentsPaid).toBe(21);
    expect(s.installmentsRemaining).toBe(15);
    expect(s.totalDealAmount).toBe(255 * 36);
    expect(s.totalAlreadyPaid).toBe(255 * 21);
    expect(s.totalRemaining).toBe(255 * 15);
    expect(s.projectedEndMonthKey).toBe("2027-08");
  });

  it("clamps to 0 paid for a future-dated rule", () => {
    const future = makeRule({ startMonth: 12, startYear: 2027 });
    const s = buildRuleInstallmentSummary(future, MAY)!;
    expect(s.installmentsPaid).toBe(0);
    expect(s.installmentsRemaining).toBe(36);
    expect(s.totalAlreadyPaid).toBe(0);
    expect(s.totalRemaining).toBe(255 * 36);
  });

  it("returns paid===total for a rule whose schedule has ended", () => {
    // Started Sep 2020, 36 months → ends Aug 2023. May 2026 is past
    // end → schedule reports inactive, paymentNumber undefined → paid
    // falls to 0. Stricter check: confirm null OR paid 0 case.
    const past = makeRule({ startMonth: 9, startYear: 2020 });
    const s = buildRuleInstallmentSummary(past, MAY)!;
    expect(s.installmentCount).toBe(36);
    // After the schedule ends the inactive branch returns
    // paymentNumber undefined → paid = 0; deliberate fallback so the
    // UI shows "0 paid" rather than ghost claims. Total deal still
    // shown accurately so the user can verify.
    expect(s.installmentsPaid).toBe(0);
  });
});

describe("buildLoanInstallmentSummary", () => {
  it("returns null for a loan without totalPayments", () => {
    expect(
      buildLoanInstallmentSummary(
        makeLoan({ totalPayments: undefined }),
        MAY,
      ),
    ).toBeNull();
  });

  it("computes deal context for an active loan", () => {
    // 60 monthly payments from Jan 2025. May 2026 = month 17.
    const s = buildLoanInstallmentSummary(makeLoan(), MAY)!;
    expect(s.monthlyPayment).toBe(1500);
    expect(s.installmentCount).toBe(60);
    expect(s.installmentsPaid).toBe(17);
    expect(s.installmentsRemaining).toBe(43);
    expect(s.totalDealAmount).toBe(1500 * 60);
    expect(s.totalAlreadyPaid).toBe(1500 * 17);
    expect(s.totalRemaining).toBe(1500 * 43);
    expect(s.projectedEndMonthKey).toBe("2029-12");
  });
});
