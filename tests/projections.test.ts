import { describe, expect, it } from "vitest";
import {
  sliceForMonth,
  projectMonth,
  actualUntilDay,
  actualByPaymentMethod,
  daysInMonth,
} from "@/lib/projections";
import type { ExpenseEntry, RecurringRule } from "@/types/finance";

const baseEntry: ExpenseEntry = {
  id: "e1",
  amount: 1200,
  category: "shopping",
  source: "manual",
  paymentMethod: "credit",
  installments: 12,
  chargeDate: new Date(2026, 4, 15).toISOString(), // 2026-05-15
  createdAt: new Date(2026, 4, 15).toISOString(),
};

describe("sliceForMonth", () => {
  it("returns null before start month", () => {
    expect(sliceForMonth(baseEntry, "2026-04")).toBeNull();
  });

  it("returns equal slice in start month and following months", () => {
    const a = sliceForMonth(baseEntry, "2026-05");
    const b = sliceForMonth(baseEntry, "2026-09");
    expect(a?.amount).toBe(100);
    expect(b?.amount).toBe(100);
  });

  it("returns null after final installment", () => {
    expect(sliceForMonth(baseEntry, "2027-05")).toBeNull();
  });

  it("clamps day-of-month for 28-day Feb", () => {
    const entry: ExpenseEntry = {
      ...baseEntry,
      installments: 6,
      chargeDate: new Date(2026, 0, 31).toISOString(), // 2026-01-31
    };
    const feb = sliceForMonth(entry, "2026-02");
    expect(feb?.chargeDate.getDate()).toBe(28);
  });
});

describe("projectMonth", () => {
  const now = new Date(2026, 4, 20); // 2026-05-20
  const monthKey = "2026-05";

  it("counts past slice as actual, future rule as upcoming", () => {
    const rule: RecurringRule = {
      id: "r1",
      label: "חשמל",
      category: "bills",
      estimatedAmount: 350,
      dayOfMonth: 28,
      keywords: ["חשמל"],
      active: true,
      createdAt: now.toISOString(),
    };

    const proj = projectMonth({
      entries: [baseEntry], // chargeDate 2026-05-15, slice = 100
      rules: [rule],
      statuses: [],
      monthKey,
      now,
    });

    expect(proj.actual).toBe(100);
    expect(proj.upcoming).toBe(350); // pending rule
    expect(proj.projected).toBe(450);
  });

  it("matched rule does not double-count via upcoming", () => {
    const rule: RecurringRule = {
      id: "r1",
      label: "חשמל",
      category: "bills",
      estimatedAmount: 350,
      dayOfMonth: 28,
      keywords: ["חשמל"],
      active: true,
      createdAt: now.toISOString(),
    };

    const proj = projectMonth({
      entries: [baseEntry],
      rules: [rule],
      statuses: [
        {
          ruleId: rule.id,
          monthKey,
          status: "paid",
          matchedExpenseId: baseEntry.id,
          actualAmount: baseEntry.amount,
        },
      ],
      monthKey,
      now,
    });

    expect(proj.upcoming).toBe(0);
    expect(proj.projected).toBe(100);
  });

  it("ignores inactive rules", () => {
    const rule: RecurringRule = {
      id: "r1",
      label: "off",
      category: "bills",
      estimatedAmount: 999,
      dayOfMonth: 1,
      keywords: [],
      active: false,
      createdAt: now.toISOString(),
    };
    const proj = projectMonth({
      entries: [],
      rules: [rule],
      statuses: [],
      monthKey,
      now,
    });
    expect(proj.upcoming).toBe(0);
  });
});

describe("actualUntilDay", () => {
  it("only counts slices on or before the day", () => {
    const entries: ExpenseEntry[] = [
      { ...baseEntry, id: "a", chargeDate: new Date(2026, 4, 5).toISOString() },
      { ...baseEntry, id: "b", chargeDate: new Date(2026, 4, 25).toISOString() },
    ];
    expect(actualUntilDay({ entries, monthKey: "2026-05", day: 10 })).toBe(100);
    expect(actualUntilDay({ entries, monthKey: "2026-05", day: 30 })).toBe(200);
  });
});

describe("actualByPaymentMethod", () => {
  it("splits credit vs cash", () => {
    const now = new Date(2026, 4, 31);
    const entries: ExpenseEntry[] = [
      {
        ...baseEntry,
        id: "credit",
        installments: 1,
        amount: 200,
        paymentMethod: "credit",
        chargeDate: new Date(2026, 4, 1).toISOString(),
      },
      {
        ...baseEntry,
        id: "cash",
        installments: 1,
        amount: 50,
        paymentMethod: "cash",
        chargeDate: new Date(2026, 4, 2).toISOString(),
      },
    ];
    const totals = actualByPaymentMethod({
      entries,
      monthKey: "2026-05",
      now,
    });
    expect(totals.credit).toBe(200);
    expect(totals.cash).toBe(50);
  });
});

describe("daysInMonth", () => {
  it("returns correct day count", () => {
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2024-02")).toBe(29); // leap
    expect(daysInMonth("2026-04")).toBe(30);
    expect(daysInMonth("2026-12")).toBe(31);
  });
});
