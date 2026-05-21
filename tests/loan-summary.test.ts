import { describe, expect, it } from "vitest";

import { summarizeLoans } from "@/lib/loan-summary";
import type { Loan, MonthKey } from "@/types/finance";

const MAY: MonthKey = "2026-05";

function loan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: "l1",
    label: "Car",
    monthlyInstallment: 1500,
    remainingBalance: 60000,
    endDate: "2029-12-01",
    dayOfMonth: 5,
    startMonth: 1,
    startYear: 2025,
    totalPayments: 60,
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("summarizeLoans", () => {
  it("returns zeros when there are no active loans", () => {
    const s = summarizeLoans({ loans: [], monthKey: MAY });
    expect(s.totalMonthly).toBe(0);
    expect(s.totalRemaining).toBe(0);
    expect(s.activeCount).toBe(0);
    expect(s.completedSoonCount).toBe(0);
    expect(s.debtFreeMonthKey).toBeUndefined();
  });

  it("sums monthly + remaining across active loans", () => {
    const s = summarizeLoans({
      loans: [
        loan(),
        loan({
          id: "l2",
          label: "Couch",
          monthlyInstallment: 500,
          startMonth: 5,
          startYear: 2025,
          totalPayments: 24,
        }),
      ],
      monthKey: MAY,
    });
    expect(s.activeCount).toBe(2);
    expect(s.totalMonthly).toBe(2000);
    // l1: starts Jan 2025, 60 payments → May 2026 is month 17, remaining 43 + current = 44 → 44 * 1500 = 66000
    // l2: starts May 2025, 24 payments → May 2026 is month 13, remaining 11 + current = 12 → 12 * 500 = 6000
    expect(s.totalRemaining).toBe(66000 + 6000);
  });

  it("identifies the furthest debt-free month", () => {
    const s = summarizeLoans({
      loans: [
        loan({
          id: "short",
          startMonth: 1,
          startYear: 2026,
          totalPayments: 12,
        }),
        loan({
          id: "long",
          startMonth: 1,
          startYear: 2026,
          totalPayments: 60,
        }),
      ],
      monthKey: MAY,
    });
    expect(s.debtFreeMonthKey).toBe("2030-12");
  });

  it("counts loans completing within the horizon", () => {
    const s = summarizeLoans({
      loans: [
        loan({
          id: "soon",
          startMonth: 1,
          startYear: 2025,
          totalPayments: 17, // ends May 2026
        }),
        loan({
          id: "far",
          startMonth: 1,
          startYear: 2025,
          totalPayments: 60, // ends Dec 2029
        }),
      ],
      monthKey: MAY,
      horizonMonths: 3,
    });
    expect(s.completedSoonCount).toBe(1);
  });

  it("skips inactive loans", () => {
    const s = summarizeLoans({
      loans: [loan({ active: false })],
      monthKey: MAY,
    });
    expect(s.activeCount).toBe(0);
    expect(s.totalMonthly).toBe(0);
  });

  it("uses legacy remainingBalance when start/total are missing", () => {
    const s = summarizeLoans({
      loans: [
        loan({
          startMonth: undefined,
          startYear: undefined,
          totalPayments: undefined,
          remainingBalance: 5000,
        }),
      ],
      monthKey: MAY,
    });
    expect(s.totalRemaining).toBe(5000);
  });
});
