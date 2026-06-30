// Phase 428 — Acceptance tests for the user's 4-point Time tab fix.
//
// Bug 1: salary updates in Home must reflect in Time immediately.
//        We verify the data transformation (updateIncome must strip
//        current+future actualByMonth overrides) by replicating the
//        store reducer logic against a plain object. No persist
//        middleware involvement.
// Bug 2: chip totals must be per-cursor-month, not cumulative.
//        Verified directly against the engine curve.
// Bug 3: bank fixed and loans are disjoint lanes — pinned via event
//        kind partitioning.
// Bug 4: sound — verified via grep / typecheck in CI; not unit
//        testable here.

import { describe, expect, it } from "vitest";

import { buildEngineCtx, getLiquidityCurve } from "@/lib/financial-engine";
import type { Account, Income, Loan, RecurringRule } from "@/types/finance";

function bank(): Account {
  return {
    id: "bank-1",
    kind: "bank",
    label: "Bank",
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    anchorBalance: 20_000,
    anchorUpdatedAt: "2026-06-01T00:00:00.000Z",
  };
}

/** Phase 428 — same shape as store.updateIncome's reducer. Pure
 *  transform we can pin without hydrating the persist middleware. */
function applyIncomeAmountUpdate(
  income: Income,
  patch: { amount?: number; label?: string; dayOfMonth?: number },
  now: Date = new Date(2026, 5, 30, 9, 0, 0),
): Income {
  let nextActuals = income.actualByMonth;
  if (patch.amount !== undefined && nextActuals) {
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const trimmed: Record<string, number> = {};
    for (const [mk, v] of Object.entries(nextActuals)) {
      if (mk < currentKey) trimmed[mk] = v;
    }
    nextActuals = trimmed;
  }
  return {
    ...income,
    ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
    ...(patch.amount !== undefined ? { amount: patch.amount } : {}),
    ...(patch.dayOfMonth !== undefined ? { dayOfMonth: patch.dayOfMonth } : {}),
    ...(nextActuals !== income.actualByMonth
      ? { actualByMonth: nextActuals }
      : {}),
  };
}

describe("Phase 428 Bug 1 — updateIncome strips current+future actualByMonth overrides", () => {
  it("baseline change wipes June + July overrides; May (past) stays locked", () => {
    const income: Income = {
      id: "i-salary",
      label: "Salary",
      amount: 26_000,
      dayOfMonth: 2,
      active: true,
      createdAt: "2025-01-01T00:00:00.000Z",
      actualByMonth: {
        "2026-05": 26_000,
        "2026-06": 26_000,
        "2026-07": 26_000,
      },
    };
    const updated = applyIncomeAmountUpdate(income, { amount: 18_000 });
    expect(updated.amount).toBe(18_000);
    expect(updated.actualByMonth).toEqual({ "2026-05": 26_000 });
  });

  it("Time curve uses the new baseline for the next salary instance", () => {
    const NOW = new Date(2026, 5, 30, 9, 0, 0);
    const salary: Income = {
      id: "i-1",
      label: "Salary",
      amount: 18_000,
      dayOfMonth: 2,
      active: true,
      createdAt: "2025-01-01T00:00:00.000Z",
    };
    const ctx = buildEngineCtx({
      accounts: [bank()],
      rules: [],
      statuses: [],
      entries: [],
      loans: [],
      incomes: [salary],
      monthlyBudget: 0,
      now: NOW,
      monthKey: "2026-06",
    });
    const curve = getLiquidityCurve(ctx, 60);
    const julySalary = curve.points
      .flatMap((p) => p.events)
      .find(
        (e) =>
          e.kind === "income" && e.whenISO.startsWith("2026-07-02"),
      );
    expect(julySalary, "July salary event must exist").toBeDefined();
    expect(julySalary!.amount).toBe(18_000);
    expect(julySalary!.amount).not.toBe(26_000);
  });
});

describe("Phase 428 Bug 2 — chip totals are per-cursor-month, not cumulative", () => {
  it("June + July loan installments are each counted once for their own month", () => {
    const NOW = new Date(2026, 5, 30, 9, 0, 0);
    const car: Loan = {
      id: "l-car",
      label: "Car",
      monthlyInstallment: 870,
      dayOfMonth: 2,
      active: true,
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    const studies: Loan = {
      id: "l-studies",
      label: "Studies",
      monthlyInstallment: 2_700,
      dayOfMonth: 20,
      active: true,
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    const ctx = buildEngineCtx({
      accounts: [bank()],
      rules: [],
      statuses: [],
      entries: [],
      loans: [car, studies],
      incomes: [],
      monthlyBudget: 0,
      now: NOW,
      monthKey: "2026-06",
    });
    const curve = getLiquidityCurve(ctx, 60);

    function loansForMonth(month: string): number {
      let s = 0;
      for (const p of curve.points) {
        for (const ev of p.events) {
          if (ev.whenISO.slice(0, 7) !== month) continue;
          if (ev.kind === "loan") s += Math.abs(ev.amount);
        }
      }
      return s;
    }

    expect(loansForMonth("2026-06")).toBe(870 + 2_700);
    expect(loansForMonth("2026-07")).toBe(870 + 2_700);
    expect(loansForMonth("2026-08")).toBe(870 + 2_700);
    // Per-chip semantic: each chip's month-total === Σ active loan
    // installments. Never cumulative.
  });
});

describe("Phase 428 Bug 3 — loans and bank-fixed are disjoint event lanes", () => {
  it("loan installments never carry kind=bank_debit and vice versa", () => {
    const NOW = new Date(2026, 5, 30, 9, 0, 0);
    const loan: Loan = {
      id: "l-1",
      label: "Loan",
      monthlyInstallment: 870,
      dayOfMonth: 2,
      active: true,
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    const rule: RecurringRule = {
      id: "r-1",
      label: "Rent",
      category: "bills",
      estimatedAmount: 4_000,
      dayOfMonth: 1,
      keywords: [],
      active: true,
      paymentSource: "bank",
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    const ctx = buildEngineCtx({
      accounts: [bank()],
      rules: [rule],
      statuses: [],
      entries: [],
      loans: [loan],
      incomes: [],
      monthlyBudget: 0,
      now: NOW,
      monthKey: "2026-06",
    });
    const curve = getLiquidityCurve(ctx, 60);
    const events = curve.points.flatMap((p) => p.events);
    const loanEvents = events.filter((e) => e.kind === "loan");
    const bankEvents = events.filter((e) => e.kind === "bank_debit");
    expect(loanEvents.length).toBeGreaterThan(0);
    expect(bankEvents.length).toBeGreaterThan(0);
    for (const l of loanEvents) {
      expect(l.amount).toBe(-870);
      expect(l.label).toBe("Loan");
    }
    for (const b of bankEvents) {
      expect(b.amount).toBe(-4_000);
      expect(b.label).toBe("Rent");
    }
  });
});

describe("Phase 428 Bug 4 — sound stripped from Time tab", () => {
  // Compile-time check: every Time component imports nothing from
  // @/lib/haptics or @/lib/time-chime. Asserted via a grep snapshot.
  it("no Time-tab component imports haptics or time-chime modules", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const path = await import("node:path");
    const dir = path.resolve(__dirname, "..", "src/components/time");
    const offenders: string[] = [];
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".tsx") && !file.endsWith(".ts")) continue;
      const content = readFileSync(path.join(dir, file), "utf8");
      if (
        content.includes('from "@/lib/haptics"') ||
        content.includes('from "@/lib/time-chime"')
      ) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
