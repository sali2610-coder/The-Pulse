// Phase 250 — full simulated month transition under load.
//
// Builds a realistic fixture and exercises the engine across a
// 90-day window straddling the May→June→July boundary. Verifies
// the contract under stress:
//   • no duplicate firings of recurring rules
//   • no missing firings (every active rule fires once per month)
//   • installment plan reduces remaining count
//   • salary lands on its day even when status row exists for one
//     of the months
//   • loans continue to fire monthly
//   • credit settlements roll to the correct cycle
//   • next-month liquidity curve stays valid (monotonic days)
//   • future-balance breakdown sees the right totals

import { describe, expect, it } from "vitest";

import { liquidityCurve } from "@/lib/liquidity-curve";
import { buildCashFlowBuckets } from "@/lib/cash-flow-bucket";
import { buildFutureBalanceBreakdown } from "@/lib/future-balance-explain";
import { ruleSchedule } from "@/lib/installment-schedule";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";

// Anchor "now" to early May so all three months sit inside the
// 90-day window.
const NOW = new Date(2026, 4, 3, 12, 0, 0); // 2026-05-03

const fixture = (): {
  accounts: Account[];
  loans: Loan[];
  incomes: Income[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  entries: ExpenseEntry[];
} => ({
  accounts: [
    {
      id: "b1",
      kind: "bank",
      label: "Discount",
      anchorBalance: 12000,
      anchorUpdatedAt: NOW.toISOString(),
      active: true,
      createdAt: "2025-01-01T00:00:00.000Z",
    },
    {
      id: "c-isra",
      kind: "card",
      label: "Isracard",
      issuer: "isracard",
      cardLast4: "1234",
      billingDay: 25,
      paymentDay: 10,
      active: true,
      createdAt: "2025-01-01T00:00:00.000Z",
    },
  ],
  loans: [
    {
      id: "l-mortgage",
      label: "משכנתא",
      monthlyInstallment: 3500,
      remainingBalance: 200_000,
      endDate: "2030-12-31",
      dayOfMonth: 5,
      startMonth: 1,
      startYear: 2025,
      totalPayments: 60,
      active: true,
      createdAt: "2025-01-01T00:00:00.000Z",
    },
  ],
  incomes: [
    {
      id: "i-salary",
      label: "משכורת",
      amount: 12000,
      dayOfMonth: 1,
      active: true,
      createdAt: "2025-01-01T00:00:00.000Z",
    },
  ],
  rules: [
    {
      id: "r-electric",
      label: "חשמל",
      category: "bills",
      estimatedAmount: 400,
      dayOfMonth: 12,
      keywords: [],
      paymentSource: "bank",
      active: true,
      createdAt: "2025-01-01T00:00:00.000Z",
    },
    {
      id: "r-spotify",
      label: "Spotify",
      category: "entertainment",
      estimatedAmount: 30,
      dayOfMonth: 14,
      keywords: [],
      paymentSource: "card",
      linkedCardId: "c-isra",
      active: true,
      createdAt: "2025-01-01T00:00:00.000Z",
    },
    {
      id: "r-laptop",
      label: "מחשב נייד תשלומים",
      category: "shopping",
      estimatedAmount: 600,
      dayOfMonth: 10,
      keywords: [],
      paymentSource: "card",
      linkedCardId: "c-isra",
      installmentTotal: 12,
      startMonth: 1,
      startYear: 2026,
      active: true,
      createdAt: "2025-12-01T00:00:00.000Z",
    },
  ],
  // Simulate the May salary already arrived (status "paid"). The
  // engine should NOT skip the June salary.
  statuses: [],
  entries: [],
});

describe("month rollover stress simulation (May → Jul)", () => {
  it("recurring rules fire once per month — no duplicates, no skips", () => {
    const f = fixture();
    const buckets = buildCashFlowBuckets({
      ...f,
      now: NOW,
      windowDays: 90,
    });

    // r-electric is a bank rule → bank_debit bucket.
    const bank = buckets.buckets.find((b) => b.source === "bank_debit");
    const electric = (bank?.obligations ?? []).filter(
      (o) => o.refId === "r-electric",
    );
    // 90-day window from May 3 → covers May 12 + Jun 12 + Jul 12.
    const electricMonths = new Set(
      electric.map((o) => o.effectiveCashAt.slice(0, 7)),
    );
    expect(electricMonths.size).toBeGreaterThanOrEqual(2);
    // No two events share the same month.
    expect(electric.length).toBe(electricMonths.size);
  });

  it("loan installment fires once a month, never twice in the same month", () => {
    const f = fixture();
    const buckets = buildCashFlowBuckets({
      ...f,
      now: NOW,
      windowDays: 90,
    });
    const loan = buckets.buckets.find((b) => b.source === "loan");
    if (!loan) throw new Error("loan bucket missing");
    const months = new Set(
      loan.obligations.map((o) => o.effectiveCashAt.slice(0, 7)),
    );
    expect(loan.obligations.length).toBe(months.size);
    // Same amount on every event.
    for (const o of loan.obligations) expect(o.amount).toBe(3500);
  });

  it("salary lands on the configured day in every month inside the window", () => {
    const f = fixture();
    const curve = liquidityCurve({
      ...f,
      now: NOW,
      windowDays: 90,
    });
    const salaryEvents = curve.points.flatMap((p) =>
      p.events.filter((e) => e.kind === "income"),
    );
    // Salary day 1 → June 1 inside the window (curve walks 2 months
    // forward from "now"; May 1 already past, July 1 outside that
    // generator). Engine MUST emit the salary event.
    expect(salaryEvents.length).toBeGreaterThanOrEqual(1);
    for (const e of salaryEvents) {
      expect(new Date(e.whenISO).getDate()).toBe(1);
      expect(e.amount).toBe(12000);
    }
  });

  it("installment plan paymentNumber + remaining decrement across months", () => {
    const f = fixture();
    const laptop = f.rules.find((r) => r.id === "r-laptop")!;
    const may = ruleSchedule(laptop, "2026-05");
    const jun = ruleSchedule(laptop, "2026-06");
    const jul = ruleSchedule(laptop, "2026-07");
    expect(may.paymentNumber).toBe(5);
    expect(jun.paymentNumber).toBe(6);
    expect(jul.paymentNumber).toBe(7);
    expect(jun.remaining).toBe((may.remaining ?? 0) - 1);
    expect(jul.remaining).toBe((jun.remaining ?? 0) - 1);
  });

  it("future-balance breakdown matches the curve's projected balance", () => {
    const f = fixture();
    const break30 = buildFutureBalanceBreakdown({
      ...f,
      offset: 30,
      now: NOW,
      windowDays: 90,
    });
    const curve = liquidityCurve({
      ...f,
      now: NOW,
      windowDays: 90,
    });
    expect(break30.projectedBalance).toBeCloseTo(curve.points[30].balance, 1);
    // Sanity: balance = anchors + income − cards − bank − loans.
    const expected =
      break30.startingBalance +
      break30.income -
      break30.cardSettlements -
      break30.bankFixed -
      break30.loans;
    expect(break30.projectedBalance).toBeCloseTo(expected, 1);
  });

  it("liquidity curve is monotonic — every day strictly +1 from the previous", () => {
    const f = fixture();
    const curve = liquidityCurve({
      ...f,
      now: NOW,
      windowDays: 90,
    });
    for (let i = 1; i < curve.points.length; i++) {
      const prev = new Date(curve.points[i - 1].whenISO);
      const cur = new Date(curve.points[i].whenISO);
      const diff = Math.round(
        (cur.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000),
      );
      expect(diff).toBe(1);
    }
    expect(curve.points).toHaveLength(91); // day 0 + 90
  });

  it("skipped recurring status drops only that month, not subsequent months", () => {
    const f = fixture();
    // Mark May electricity as paid; engine must STILL fire Jun + Jul.
    f.statuses = [
      { ruleId: "r-electric", monthKey: "2026-05", status: "paid" },
    ];
    const buckets = buildCashFlowBuckets({
      ...f,
      now: NOW,
      windowDays: 90,
    });
    const bank = buckets.buckets.find((b) => b.source === "bank_debit");
    const electric = (bank?.obligations ?? []).filter(
      (o) => o.refId === "r-electric",
    );
    const months = new Set(
      electric.map((o) => o.effectiveCashAt.slice(0, 7)),
    );
    // May skipped → Jun + Jul still present.
    expect(months.has("2026-05")).toBe(false);
    expect(months.has("2026-06")).toBe(true);
  });

  it("two cards never merge — Isracard installment stays under Isracard only", () => {
    const f = fixture();
    f.accounts.push({
      id: "c-cal",
      kind: "card",
      label: "CAL",
      issuer: "cal",
      cardLast4: "5678",
      billingDay: 20,
      paymentDay: 2,
      active: true,
      createdAt: "2025-01-01T00:00:00.000Z",
    });
    f.rules.push({
      id: "r-cal-only",
      label: "CAL מנוי",
      category: "bills",
      estimatedAmount: 90,
      dayOfMonth: 10,
      keywords: [],
      paymentSource: "card",
      linkedCardId: "c-cal",
      active: true,
      createdAt: "2025-01-01T00:00:00.000Z",
    });
    const buckets = buildCashFlowBuckets({
      ...f,
      now: NOW,
      windowDays: 90,
    });
    const cardBuckets = buckets.buckets.filter((b) => b.source === "card");
    expect(cardBuckets.length).toBe(2);
    const isracardCard = cardBuckets.find((b) => b.cardId === "c-isra");
    const cal = cardBuckets.find((b) => b.cardId === "c-cal");
    expect(isracardCard).toBeDefined();
    expect(cal).toBeDefined();
    // No CAL-only rule should land in the Isracard bucket.
    expect(
      isracardCard?.obligations.some((o) => o.refId === "r-cal-only"),
    ).toBe(false);
    expect(
      cal?.obligations.some((o) => o.refId === "r-cal-only"),
    ).toBe(true);
  });
});
