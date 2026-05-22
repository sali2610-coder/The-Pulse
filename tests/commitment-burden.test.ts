import { describe, expect, it } from "vitest";

import { commitmentBurden } from "@/lib/commitment-burden";
import type { Loan, RecurringRule } from "@/types/finance";

function loan(o: Partial<Loan> = {}): Loan {
  return {
    id: o.id ?? "l1",
    label: o.label ?? "מכונית",
    monthlyInstallment: 1000,
    dayOfMonth: 5,
    startMonth: 1,
    startYear: 2026,
    totalPayments: 12,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

function rule(o: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: o.id ?? "r1",
    label: o.label ?? "צמיגים",
    category: "transport",
    estimatedAmount: 400,
    dayOfMonth: 10,
    keywords: [],
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    installmentTotal: 5,
    startMonth: 1,
    startYear: 2026,
    ...o,
  };
}

describe("commitmentBurden", () => {
  it("empty inputs → zeroes", () => {
    const r = commitmentBurden({
      loans: [],
      rules: [],
      monthKey: "2026-05",
    });
    expect(r.totalRemaining).toBe(0);
    expect(r.monthlyOutflow).toBe(0);
    expect(r.plansActive).toBe(0);
    expect(r.items).toEqual([]);
  });

  it("aggregates a single loan with explicit schedule", () => {
    // 12-month loan starting Jan 2026 at 1000/m. May 2026 = payment
    // 5 of 12 → 8 payments left (including May).
    const r = commitmentBurden({
      loans: [loan()],
      rules: [],
      monthKey: "2026-05",
    });
    expect(r.plansActive).toBe(1);
    expect(r.monthlyOutflow).toBe(1000);
    expect(r.items[0].remainingPayments).toBe(8);
    expect(r.items[0].remainingTotal).toBe(8000);
    expect(r.totalRemaining).toBe(8000);
    expect(r.byKind.loans.count).toBe(1);
    expect(r.byKind.loans.totalRemaining).toBe(8000);
    expect(r.byKind.installments.count).toBe(0);
  });

  it("aggregates installment-plan rule", () => {
    // 5-month plan starting Jan 2026 at 400/m. May 2026 = payment 5
    // of 5 → 1 left.
    const r = commitmentBurden({
      loans: [],
      rules: [rule()],
      monthKey: "2026-05",
    });
    expect(r.plansActive).toBe(1);
    expect(r.items[0].remainingPayments).toBe(1);
    expect(r.items[0].remainingTotal).toBe(400);
    expect(r.byKind.installments.totalRemaining).toBe(400);
  });

  it("combines loans + rules + sorts by remainingTotal DESC", () => {
    const r = commitmentBurden({
      loans: [
        loan({
          id: "small",
          monthlyInstallment: 500,
          totalPayments: 12,
        }),
      ],
      rules: [
        rule({
          id: "big",
          estimatedAmount: 5000,
          installmentTotal: 6,
        }),
      ],
      monthKey: "2026-02",
    });
    expect(r.items[0].id).toBe("big"); // bigger remaining total
    expect(r.items[1].id).toBe("small");
  });

  it("skips inactive loans / rules", () => {
    const r = commitmentBurden({
      loans: [loan({ active: false })],
      rules: [rule({ active: false })],
      monthKey: "2026-05",
    });
    expect(r.plansActive).toBe(0);
  });

  it("skips open-ended loans (no totalPayments) — can't bound", () => {
    const r = commitmentBurden({
      loans: [
        {
          id: "open",
          label: "open",
          monthlyInstallment: 1000,
          dayOfMonth: 5,
          active: true,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      rules: [],
      monthKey: "2026-05",
    });
    expect(r.totalRemaining).toBe(0);
  });

  it("longestEndMonth picks the furthest endMonth across items", () => {
    const r = commitmentBurden({
      loans: [loan({ id: "L", startMonth: 1, startYear: 2026, totalPayments: 6 })],
      rules: [
        rule({
          id: "R",
          startMonth: 1,
          startYear: 2026,
          installmentTotal: 24,
        }),
      ],
      monthKey: "2026-02",
    });
    expect(r.longestEndMonth).toBe("2027-12");
  });

  it("excludes completed plans (sched not active)", () => {
    const r = commitmentBurden({
      loans: [],
      rules: [
        rule({
          installmentTotal: 3,
          startMonth: 1,
          startYear: 2026,
        }),
      ],
      monthKey: "2026-06", // 3-month plan ended in March
    });
    expect(r.plansActive).toBe(0);
  });
});
