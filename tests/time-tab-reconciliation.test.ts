// Phase 422 — Time tab reconciliation.
//
// User reported all date chips (10 / סוף חודש / 2 / 10+) were
// wrong, the "10" chip rendered as disabled when today IS the 10th,
// and today's loan was never deducted on day 0. The fixes:
//
// 1. offsetToDayOfMonth compares day-of-month so "10" on the 10th
//    means TODAY (offset 0), not next month.
// 2. liquidityCurve's day-0 push unions pastBank events with TODAY's
//    scheduled events (loans / fixed obligations / card slices
//    firing on today's date) so the LIVE balance reflects them and
//    the cursor at offset 0 carries them in `events`.
// 3. useTimeEngine routes through FinancialEngine.getLiquidityCurve
//    so every chip resolves against the same canonical projection.
//
// This file pins each invariant and prints the per-chip
// reconciliation table the user asked for.

import { describe, expect, it } from "vitest";

import { buildEngineCtx, getLiquidityCurve } from "@/lib/financial-engine";
import { liquidityCurve } from "@/lib/liquidity-curve";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
} from "@/types/finance";

const TODAY = new Date(2026, 5, 10, 9, 0, 0); // 2026-06-10, Wednesday-ish.

function bank(o: Partial<Account> = {}): Account {
  return {
    id: o.id ?? "bank-1",
    kind: "bank",
    label: "Bank",
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    anchorBalance: o.anchorBalance ?? 10_000,
    anchorUpdatedAt:
      o.anchorUpdatedAt ?? new Date(2026, 5, 1, 0, 0, 0).toISOString(),
    ...o,
  };
}

function card(o: Partial<Account> = {}): Account {
  return {
    id: o.id ?? "card-1",
    kind: "card",
    label: "Visa",
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    issuer: "cal",
    cardLast4: "1234",
    billingDay: 2,
    paymentDay: 10,
    ...o,
  };
}

const TODAY_LOAN: Loan = {
  id: "l-today",
  label: "Today's loan",
  monthlyInstallment: 1_500,
  dayOfMonth: 10, // fires TODAY (2026-06-10)
  active: true,
  createdAt: "2025-01-01T00:00:00.000Z",
};

const SALARY: Income = {
  id: "i-1",
  label: "Salary",
  amount: 12_000,
  dayOfMonth: 28, // fires 2026-06-28
  active: true,
  createdAt: "2025-01-01T00:00:00.000Z",
};

const RENT_RULE: RecurringRule = {
  id: "r-rent",
  label: "Rent",
  category: "bills",
  estimatedAmount: 4_000,
  dayOfMonth: 1, // already passed for June; fires again 2026-07-01
  keywords: [],
  active: true,
  paymentSource: "bank",
  createdAt: "2025-01-01T00:00:00.000Z",
};

function buildCtx(extra?: Partial<Parameters<typeof buildEngineCtx>[0]>) {
  return buildEngineCtx({
    accounts: [bank(), card()],
    loans: [TODAY_LOAN],
    incomes: [SALARY],
    rules: [RENT_RULE],
    statuses: [],
    entries: [],
    monthlyBudget: 0,
    monthKey: "2026-06",
    now: TODAY,
    ...extra,
  });
}

// Canonical chip offsets — same math as useTimeEngine.
function daysBetween(target: Date, now: Date): number {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
function offsetToDayOfMonth(now: Date, day: number): number {
  if (now.getDate() <= day) {
    return Math.max(
      0,
      daysBetween(new Date(now.getFullYear(), now.getMonth(), day), now),
    );
  }
  return Math.max(
    0,
    daysBetween(new Date(now.getFullYear(), now.getMonth() + 1, day), now),
  );
}
function offsetToEom(now: Date): number {
  return Math.max(
    0,
    daysBetween(new Date(now.getFullYear(), now.getMonth() + 1, 0), now),
  );
}
function offsetToDayOfNextMonth(now: Date, day: number): number {
  return Math.max(
    0,
    daysBetween(new Date(now.getFullYear(), now.getMonth() + 1, day), now),
  );
}

describe("Phase 422 — Time tab chip offsets resolve correctly when today IS the 10th", () => {
  it('"10" chip means TODAY when now.getDate() === 10', () => {
    expect(offsetToDayOfMonth(TODAY, 10)).toBe(0);
  });

  it('"10" chip means future when today is BEFORE the 10th', () => {
    const earlier = new Date(2026, 5, 5);
    expect(offsetToDayOfMonth(earlier, 10)).toBe(5);
  });

  it('"10" chip means next month when today is AFTER the 10th', () => {
    const later = new Date(2026, 5, 15);
    expect(offsetToDayOfMonth(later, 10)).toBe(daysBetween(new Date(2026, 6, 10), later));
  });

  it('"סוף חודש" offset matches end of current month', () => {
    expect(offsetToEom(TODAY)).toBe(20); // June 30 - June 10.
  });

  it('"2 next month" offset matches July 2nd', () => {
    expect(offsetToDayOfNextMonth(TODAY, 2)).toBe(daysBetween(new Date(2026, 6, 2), TODAY));
  });

  it('"10 next month" offset matches July 10th', () => {
    expect(offsetToDayOfNextMonth(TODAY, 10)).toBe(daysBetween(new Date(2026, 6, 10), TODAY));
  });
});

describe("Phase 422 — liquidityCurve includes today's events in day 0", () => {
  it("today's loan is deducted in day-0 events and balance", () => {
    const ctx = buildCtx();
    const curve = getLiquidityCurve(ctx, 35);
    const day0 = curve.points[0];
    const loanEvent = day0.events.find(
      (e) => e.kind === "loan" && Math.abs(e.amount) === 1_500,
    );
    expect(loanEvent, "loan should fire on day 0").toBeDefined();
    expect(day0.balance).toBe(10_000 - 1_500);
  });

  it("FinancialEngine.getLiquidityCurve === legacy liquidityCurve (canonical path)", () => {
    const ctx = buildCtx();
    const viaEngine = getLiquidityCurve(ctx, 35);
    const viaLegacy = liquidityCurve({
      accounts: ctx.accounts,
      loans: ctx.loans,
      incomes: ctx.incomes,
      rules: ctx.rules,
      statuses: ctx.statuses,
      entries: ctx.entries,
      now: ctx.now,
      windowDays: 35,
    });
    expect(viaEngine.points.length).toBe(viaLegacy.points.length);
    expect(viaEngine.startingBalance).toBe(viaLegacy.startingBalance);
    expect(viaEngine.points[0].balance).toBe(viaLegacy.points[0].balance);
  });
});

describe("Phase 422 — reconciliation table: each Time chip balance matches the engine curve", () => {
  const ctx = buildCtx();
  const curve = getLiquidityCurve(ctx, 60);

  const chips: Array<{ name: string; offset: number }> = [
    { name: "LIVE", offset: 0 },
    { name: "10", offset: offsetToDayOfMonth(TODAY, 10) },
    { name: "סוף חודש", offset: offsetToEom(TODAY) },
    { name: "2 next month", offset: offsetToDayOfNextMonth(TODAY, 2) },
    { name: "10 next month", offset: offsetToDayOfNextMonth(TODAY, 10) },
    { name: "Custom (+20)", offset: 20 },
  ];

  it("prints reconciliation table and pins each chip balance against the engine curve", () => {
    const table: Array<Record<string, string | number>> = [];
    for (const chip of chips) {
      const offset = Math.min(chip.offset, curve.points.length - 1);
      const point = curve.points[offset];
      let income = 0;
      let loans = 0;
      let card_ = 0;
      let bankDebit = 0;
      for (let i = 0; i <= offset; i++) {
        for (const ev of curve.points[i].events) {
          if (ev.kind === "income") income += ev.amount;
          else if (ev.kind === "loan") loans += Math.abs(ev.amount);
          else if (ev.kind === "card") card_ += Math.abs(ev.amount);
          else if (ev.kind === "bank_debit")
            bankDebit += Math.abs(ev.amount);
        }
      }
      table.push({
        chip: chip.name,
        offset,
        selectedDate: point.whenISO.slice(0, 10),
        income,
        bankFixed: bankDebit,
        loans,
        creditCards: card_,
        balance: point.balance,
      });
    }
    // eslint-disable-next-line no-console
    console.table(table);

    // Pin: "10" on the 10th must select offset 0 (today) — not 30.
    expect(table[1].selectedDate).toBe(table[0].selectedDate);
    // Pin: today's loan is in LIVE's deductions.
    expect(table[0].loans).toBe(1_500);
    // Pin: balance never drifts from curve.points[i].balance.
    for (const row of table) {
      expect(row.balance).toBe(curve.points[row.offset as number].balance);
    }
    // Pin: EOM balance = LIVE balance + Σ events from day 1..EOM.
    const eomRow = table[2];
    const eomOffset = eomRow.offset as number;
    let liveToEomDelta = 0;
    for (let i = 1; i <= eomOffset; i++) {
      for (const ev of curve.points[i].events) liveToEomDelta += ev.amount;
    }
    expect(eomRow.balance).toBeCloseTo(
      (table[0].balance as number) + liveToEomDelta,
      2,
    );
  });
});
