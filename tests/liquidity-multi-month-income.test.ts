// Phase 259 — guard against the income-loop regression.
//
// Previously the liquidity-curve income loop iterated only m=0..1,
// so a 60-day window dropped any salary instance past the second
// month. That broke the Hero Future Balance card on the 10th of
// the FOLLOWING month — the salary that should have landed there
// silently vanished and the user saw an unexplained negative jump.
// This test pins the corrected behaviour.

import { describe, expect, it } from "vitest";

import { liquidityCurve } from "@/lib/liquidity-curve";
import type { Account, Income } from "@/types/finance";

function bank(o: Partial<Account> = {}): Account {
  return {
    id: "b1",
    kind: "bank",
    label: "Discount",
    anchorBalance: 5000,
    anchorUpdatedAt: "2026-05-26T00:00:00.000Z",
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...o,
  };
}

function income(o: Partial<Income> = {}): Income {
  return {
    id: "i1",
    label: "משכורת",
    amount: 12000,
    dayOfMonth: 1,
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...o,
  };
}

describe("liquidity curve — multi-month income injection", () => {
  it("emits two salaries when the 60-day window straddles three months", () => {
    const now = new Date(2026, 4, 28, 12, 0, 0); // 2026-05-28
    const curve = liquidityCurve({
      accounts: [bank()],
      loans: [],
      incomes: [income({ dayOfMonth: 1, amount: 12000 })],
      rules: [],
      statuses: [],
      entries: [],
      now,
      windowDays: 60,
    });
    const salaryEvents = curve.points.flatMap((p) =>
      p.events.filter((e) => e.kind === "income"),
    );
    // Jun 1 + Jul 1 must both land inside the window.
    expect(salaryEvents.length).toBe(2);
    const months = new Set(
      salaryEvents.map((e) => e.whenISO.slice(0, 7)),
    );
    expect(months.has("2026-06")).toBe(true);
    expect(months.has("2026-07")).toBe(true);
  });

  it("emits three salaries when the window covers a quarter", () => {
    const now = new Date(2026, 4, 28, 12, 0, 0);
    const curve = liquidityCurve({
      accounts: [bank()],
      loans: [],
      incomes: [income({ dayOfMonth: 1, amount: 12000 })],
      rules: [],
      statuses: [],
      entries: [],
      now,
      windowDays: 90,
    });
    const salaryEvents = curve.points.flatMap((p) =>
      p.events.filter((e) => e.kind === "income"),
    );
    expect(salaryEvents.length).toBe(3); // Jun 1 + Jul 1 + Aug 1 all in window
  });

  it("does not double-count when day-of-month has already passed for the current month", () => {
    const now = new Date(2026, 4, 28, 12, 0, 0); // May 28
    const curve = liquidityCurve({
      accounts: [bank()],
      loans: [],
      incomes: [income({ dayOfMonth: 1 })],
      rules: [],
      statuses: [],
      entries: [],
      now,
      windowDays: 60,
    });
    const salaryEvents = curve.points.flatMap((p) =>
      p.events.filter((e) => e.kind === "income"),
    );
    // May 1 already in the past → must NOT be emitted.
    expect(
      salaryEvents.find((e) => e.whenISO.startsWith("2026-05")),
    ).toBeUndefined();
  });

  it("balanceAtNextSalary equals start + salary amount on the salary day", () => {
    const now = new Date(2026, 4, 28, 12, 0, 0);
    const curve = liquidityCurve({
      accounts: [bank({ anchorBalance: 1000 })],
      loans: [],
      incomes: [income({ dayOfMonth: 1, amount: 12000 })],
      rules: [],
      statuses: [],
      entries: [],
      now,
      windowDays: 60,
    });
    expect(curve.nextSalaryAt?.slice(0, 7)).toBe("2026-06");
    expect(curve.balanceAtNextSalary).toBe(13000);
  });
});
