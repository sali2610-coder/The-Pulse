// Phase 391 — breakdown.total must equal Σ rounded lane totals.
//
// User saw the cockpit show Credit ₪12,000 + Bank ₪9,372 = ₪21,372
// while "Where the money goes" showed ₪21,382 — a ₪10 phantom gap.
// Root cause: total was Math.round(rawSum) while each lane was
// individually rounded, so per-lane sums could disagree with the
// headline by a few shekels.
//
// Invariant: breakdown.total === creditCardsTotal + bankFixedTotal
// + loansTotal + cashTotal AFTER each lane has been rounded.

import { describe, expect, it } from "vitest";

import { getMonthlyObligationBreakdown } from "@/lib/monthly-obligation-breakdown";
import type {
  ExpenseEntry,
  Loan,
  RecurringRule,
} from "@/types/finance";

const MONTH_KEY = "2026-06" as const;

function rule(o: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: o.id ?? `r-${Math.random().toString(36).slice(2, 8)}`,
    label: "rule",
    category: "bills",
    estimatedAmount: 100,
    dayOfMonth: 10,
    keywords: [],
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

describe("Phase 391 — total equals sum of rounded lanes", () => {
  it("integer amounts: trivially equal", () => {
    const r = getMonthlyObligationBreakdown({
      rules: [
        rule({
          id: "r-card",
          paymentSource: "card",
          linkedCardId: "card-1",
          estimatedAmount: 540,
        }),
        rule({ id: "r-bank", paymentSource: "bank", estimatedAmount: 800 }),
      ],
      loans: [] as Loan[],
      entries: [] as ExpenseEntry[],
      statuses: [],
      monthKey: MONTH_KEY,
    });
    expect(r.total).toBe(
      r.creditCardsTotal + r.bankFixedTotal + r.loansTotal + r.cashTotal,
    );
  });

  it("fractional amounts: total still equals sum of rounded lanes", () => {
    // 540.50 + 800.50 = 1341.00, but if we rounded each lane FIRST
    // (541 + 801) and then derived total from rawSum we'd get
    // Math.round(1341.00) = 1341 → mismatch. Phase 391 derives
    // total from the rounded lanes so it is ALWAYS internally
    // consistent.
    const r = getMonthlyObligationBreakdown({
      rules: [
        rule({
          id: "r-card",
          paymentSource: "card",
          linkedCardId: "card-1",
          estimatedAmount: 540.5,
        }),
        rule({
          id: "r-bank",
          paymentSource: "bank",
          estimatedAmount: 800.5,
        }),
      ],
      loans: [] as Loan[],
      entries: [] as ExpenseEntry[],
      statuses: [],
      monthKey: MONTH_KEY,
    });
    expect(r.total).toBe(
      r.creditCardsTotal + r.bankFixedTotal + r.loansTotal + r.cashTotal,
    );
  });

  it("many fractional rules: total still adds up", () => {
    const rules: RecurringRule[] = Array.from({ length: 20 }).map((_, i) =>
      rule({
        id: `r-${i}`,
        estimatedAmount: 99.5 + i * 0.5,
        paymentSource: "bank",
      }),
    );
    const r = getMonthlyObligationBreakdown({
      rules,
      loans: [] as Loan[],
      entries: [] as ExpenseEntry[],
      statuses: [],
      monthKey: MONTH_KEY,
    });
    expect(r.total).toBe(
      r.creditCardsTotal + r.bankFixedTotal + r.loansTotal + r.cashTotal,
    );
  });
});
