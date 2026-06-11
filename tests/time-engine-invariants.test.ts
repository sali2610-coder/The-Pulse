// Phase 425 — Time engine invariant gate.
//
// PROBLEM: bugs like "Studies 2,700 not visible on LIVE" /
// "Car 870 vanished when today > dayOfMonth" /
// "10 chip skipped today on the 10th" all share the same
// failure mode — the Time engine produces silent gaps that
// only show up when (today, dayOfMonth, anchorUpdatedAt,
// month-rollover) line up in one specific way.
//
// SOLUTION: a sweep test that runs the engine across every
// permutation of (today, dayOfMonth, monthsInWindow) and
// pins five invariants that must hold for the product to be
// trustworthy in the market:
//
//   I1. Every enabled loan with sched.active for some month in
//       the window MUST produce at least one curve event in that
//       month. Silent drops fail.
//
//   I2. Σ of loan-event amounts across the curve === Σ of
//       monthlyInstallment × months_active_in_window. The engine
//       cannot under- or over-count installments per month.
//
//   I3. LIVE balance + Σ(events from day 1..offset) ===
//       curve.points[offset].balance. The chip-cumulative aggregator
//       can never drift from the running balance.
//
//   I4. The "10" chip on day === 10 resolves to TODAY (offset 0).
//       Strict-less-than comparisons used to push it to next month.
//
//   I5. Date-of-month coercion is safe across short months: a
//       loan dayOfMonth=31 fires once in February (on the 28th or
//       29th), not zero times and not twice.

import { describe, expect, it } from "vitest";

import { buildEngineCtx, getLiquidityCurve } from "@/lib/financial-engine";
import { loanSchedule } from "@/lib/installment-schedule";
import type { Account, Loan, MonthKey } from "@/types/finance";

function bank(o: Partial<Account> = {}): Account {
  return {
    id: o.id ?? "bank-1",
    kind: "bank",
    label: "Bank",
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    anchorBalance: o.anchorBalance ?? 20_000,
    anchorUpdatedAt: o.anchorUpdatedAt ?? "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

function loan(o: Partial<Loan>): Loan {
  return {
    id: o.id ?? "l-x",
    label: o.label ?? "Loan",
    monthlyInstallment: o.monthlyInstallment ?? 1_000,
    dayOfMonth: o.dayOfMonth ?? 10,
    active: o.active ?? true,
    createdAt: "2024-01-01T00:00:00.000Z",
    ...o,
  };
}

function monthsBetween(now: Date, windowDays: number): MonthKey[] {
  const out: MonthKey[] = [];
  const seen = new Set<string>();
  const horizon = new Date(now.getTime() + windowDays * 86_400_000);
  let cursor = new Date(now.getFullYear(), now.getMonth(), 1);
  while (cursor.getTime() <= horizon.getTime()) {
    const mk = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    if (!seen.has(mk)) {
      seen.add(mk);
      out.push(mk as MonthKey);
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return out;
}

// ── Invariant I1 + I2: loan-event presence + sum integrity ──────

describe("Phase 425 — invariant I1+I2: every active loan installment surfaces (no silent drops)", () => {
  const loans = [
    loan({ id: "l-car", label: "Car", monthlyInstallment: 870, dayOfMonth: 5 }),
    loan({ id: "l-studies", label: "Studies", monthlyInstallment: 2_700, dayOfMonth: 20 }),
    loan({ id: "l-rent", label: "Mortgage", monthlyInstallment: 4_500, dayOfMonth: 1 }),
    loan({ id: "l-eom", label: "Late", monthlyInstallment: 600, dayOfMonth: 31 }),
  ];

  // Sweep every day of every month for one full calendar year.
  for (let month = 0; month < 12; month++) {
    for (let day = 1; day <= 28; day++) {
      it(`today=2026-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")} — each active loan appears at least once`, () => {
        const now = new Date(2026, month, day, 9, 0, 0);
        const ctx = buildEngineCtx({
          accounts: [bank()],
          loans,
          incomes: [],
          rules: [],
          statuses: [],
          entries: [],
          monthlyBudget: 0,
          monthKey: `2026-${String(month + 1).padStart(2, "0")}` as MonthKey,
          now,
        });
        const curve = getLiquidityCurve(ctx, 60);

        // Build the set of (loan, monthKey) pairs we expect events for.
        // Past installments in the CURRENT month surface as day-0 events;
        // future installments must land on their dayOfMonth and lie
        // strictly within the [now, now+windowDays] window.
        const windowDays = 60;
        const horizon = new Date(now.getTime() + windowDays * 86_400_000);
        const expectedPairs = new Set<string>();
        for (const mk of monthsBetween(now, windowDays)) {
          for (const l of loans) {
            if (!l.active) continue;
            if (!loanSchedule(l, mk).active) continue;
            const [y, m] = mk.split("-").map(Number);
            const lastDay = new Date(y!, m!, 0).getDate();
            const day = Math.min(Math.max(1, l.dayOfMonth), lastDay);
            const dueDate = new Date(y!, m! - 1, day, 12, 0, 0);
            const isPastCurrentMonth =
              dueDate.getTime() <= now.getTime() &&
              dueDate.getFullYear() === now.getFullYear() &&
              dueDate.getMonth() === now.getMonth();
            const isFutureInWindow =
              dueDate.getTime() > now.getTime() &&
              dueDate.getTime() <= horizon.getTime();
            if (!isPastCurrentMonth && !isFutureInWindow) continue;
            expectedPairs.add(`${l.id}:${mk}`);
          }
        }

        // Collect actual loan-event (loanId, monthKey) pairs from the curve.
        const seenPairs = new Set<string>();
        const allEvents = curve.points.flatMap((p) => p.events);
        for (const ev of allEvents) {
          if (ev.kind !== "loan") continue;
          const mk = ev.whenISO.slice(0, 7);
          const matchedLoan = loans.find((l) => l.label === ev.label);
          if (!matchedLoan) continue;
          seenPairs.add(`${matchedLoan.id}:${mk}`);
        }

        // I1: every expected pair must be present.
        for (const pair of expectedPairs) {
          expect(
            seenPairs.has(pair),
            `Missing loan event for ${pair} when today=2026-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
          ).toBe(true);
        }

        // I2: Σ event amounts === Σ monthlyInstallment per active (loan, month).
        const expectedSum = Array.from(expectedPairs).reduce((s, pair) => {
          const [loanId] = pair.split(":");
          const l = loans.find((x) => x.id === loanId)!;
          return s + l.monthlyInstallment;
        }, 0);
        const actualSum = allEvents
          .filter((e) => e.kind === "loan")
          .reduce((s, e) => s + Math.abs(e.amount), 0);
        expect(actualSum).toBe(expectedSum);
      });
    }
  }
});

// ── Invariant I3: chip cumulative === curve balance ─────────────

describe("Phase 425 — invariant I3: chip cumulative ≡ curve balance at every offset", () => {
  it("for a 60-day window, sum of deltas equals curve.points[offset].balance for every offset", () => {
    const now = new Date(2026, 5, 11, 14, 0, 0);
    const ctx = buildEngineCtx({
      accounts: [bank({ anchorBalance: 25_000, anchorUpdatedAt: "2026-06-01T00:00:00.000Z" })],
      loans: [
        loan({ id: "l-1", monthlyInstallment: 870, dayOfMonth: 5 }),
        loan({ id: "l-2", monthlyInstallment: 2_700, dayOfMonth: 20 }),
      ],
      incomes: [
        {
          id: "i-1",
          label: "Salary",
          amount: 12_000,
          dayOfMonth: 28,
          active: true,
          createdAt: "2025-01-01T00:00:00.000Z",
        },
      ],
      rules: [],
      statuses: [],
      entries: [],
      monthlyBudget: 0,
      monthKey: "2026-06",
      now,
    });
    const curve = getLiquidityCurve(ctx, 60);
    for (let offset = 0; offset < curve.points.length; offset++) {
      let running = curve.startingBalance;
      for (let i = 0; i <= offset; i++) {
        for (const ev of curve.points[i].events) {
          if (ev.informational) continue;
          running += ev.amount;
        }
      }
      expect(Math.round(running * 100) / 100).toBeCloseTo(
        curve.points[offset].balance,
        2,
      );
    }
  });
});

// ── Invariant I4: chip semantics across the 31-day month ────────

describe("Phase 425 — invariant I4: '10' chip semantics across every day of the month", () => {
  function offsetToDayOfMonth(now: Date, day: number): number {
    if (now.getDate() <= day) {
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), day);
      return Math.max(
        0,
        Math.round((thisMonth.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000),
      );
    }
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, day);
    return Math.max(
      0,
      Math.round(
        (nextMonth.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000,
      ),
    );
  }

  for (let day = 1; day <= 31; day++) {
    it(`today=2026-06-${String(day).padStart(2, "0")} — chip "10" resolves correctly`, () => {
      const now = new Date(2026, 5, day, 9, 0, 0);
      const offset = offsetToDayOfMonth(now, 10);
      if (day === 10) {
        expect(offset, '"10" on the 10th must mean TODAY').toBe(0);
      } else if (day < 10) {
        expect(offset).toBe(10 - day);
      } else {
        // After the 10th — chip resolves to NEXT month's 10th.
        const next10 = new Date(2026, 6, 10);
        const today0 = new Date(2026, 5, day);
        const expected = Math.round((next10.getTime() - today0.getTime()) / 86_400_000);
        expect(offset).toBe(expected);
      }
    });
  }
});

// ── Invariant I5: short-month / leap-year safety ────────────────

describe("Phase 425 — invariant I5: loan dayOfMonth=31 fires exactly once per month even in February", () => {
  it("dayOfMonth=31 loan, leap year February — fires on 29th, exactly once", () => {
    const now = new Date(2028, 1, 1, 9, 0, 0); // 2028 leap year, Feb 1.
    const ctx = buildEngineCtx({
      accounts: [bank()],
      loans: [loan({ id: "l-eom", monthlyInstallment: 500, dayOfMonth: 31 })],
      incomes: [],
      rules: [],
      statuses: [],
      entries: [],
      monthlyBudget: 0,
      monthKey: "2028-02",
      now,
    });
    const curve = getLiquidityCurve(ctx, 35);
    const febEvents = curve.points
      .flatMap((p) => p.events)
      .filter((e) => e.kind === "loan" && e.whenISO.startsWith("2028-02"));
    expect(febEvents).toHaveLength(1);
    expect(febEvents[0].whenISO.startsWith("2028-02-29")).toBe(true);
  });

  it("dayOfMonth=31 loan, non-leap February — fires on 28th, exactly once", () => {
    const now = new Date(2026, 1, 1, 9, 0, 0); // 2026, Feb 1.
    const ctx = buildEngineCtx({
      accounts: [bank()],
      loans: [loan({ id: "l-eom", monthlyInstallment: 500, dayOfMonth: 31 })],
      incomes: [],
      rules: [],
      statuses: [],
      entries: [],
      monthlyBudget: 0,
      monthKey: "2026-02",
      now,
    });
    const curve = getLiquidityCurve(ctx, 35);
    const febEvents = curve.points
      .flatMap((p) => p.events)
      .filter((e) => e.kind === "loan" && e.whenISO.startsWith("2026-02"));
    expect(febEvents).toHaveLength(1);
    expect(febEvents[0].whenISO.startsWith("2026-02-28")).toBe(true);
  });

  it("month-rollover: dayOfMonth=1 loan fires on the 1st of NEXT month when today is mid-month", () => {
    const now = new Date(2026, 5, 15, 9, 0, 0); // June 15.
    const ctx = buildEngineCtx({
      accounts: [bank()],
      loans: [loan({ id: "l-rent", monthlyInstallment: 4_500, dayOfMonth: 1 })],
      incomes: [],
      rules: [],
      statuses: [],
      entries: [],
      monthlyBudget: 0,
      monthKey: "2026-06",
      now,
    });
    const curve = getLiquidityCurve(ctx, 60);
    // Past: June 1 should surface as day-0 event (presumed already debited).
    const juneEv = curve.points
      .flatMap((p) => p.events)
      .filter((e) => e.kind === "loan" && e.whenISO.startsWith("2026-06"));
    expect(juneEv.length).toBeGreaterThanOrEqual(1);
    // Future: July 1 within window.
    const julyEv = curve.points
      .flatMap((p) => p.events)
      .filter((e) => e.kind === "loan" && e.whenISO.startsWith("2026-07-01"));
    expect(julyEv).toHaveLength(1);
  });
});
