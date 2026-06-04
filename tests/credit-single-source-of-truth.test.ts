// Phase 377 — single-source-of-truth invariant.
//
// The cockpit Credit value and the Credit Cards section MUST equal
// the same number for the same store state. Both must read from
// getCreditCardExposure.
//
// Before Phase 377, getMonthlyObligationBreakdown.creditCardsTotal
// summed only card-settled RULES. It ignored credit ENTRIES (manual
// / wallet / sms / installments / pending). The Credit Cards section
// (via buildCardPressure) counted them, so the cockpit undercounted.
//
// Now getMonthlyObligationBreakdown delegates the credit lane to
// getCreditCardExposure verbatim. These specs pin the contract so
// the two surfaces can never diverge again.

import { describe, expect, it } from "vitest";

import { getMonthlyObligationBreakdown } from "@/lib/monthly-obligation-breakdown";
import { getCreditCardExposure } from "@/lib/credit-card-exposure";
import type {
  ExpenseEntry,
  RecurringRule,
} from "@/types/finance";

const MONTH_KEY = "2026-06" as const;
const MONTH_DATE = new Date(2026, 5, 10, 12, 0, 0).toISOString();

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

function entry(o: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: o.id ?? `e-${Math.random().toString(36).slice(2, 8)}`,
    amount: 200,
    category: "shopping",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: MONTH_DATE,
    createdAt: MONTH_DATE,
    ...o,
  };
}

describe("breakdown.creditCardsTotal == exposure.totalExpectedCharge", () => {
  it("rules + manual + wallet + sms + installments + pending — total identical", () => {
    const inputs = {
      rules: [
        rule({
          id: "r-card",
          paymentSource: "card",
          linkedCardId: "card-1",
          estimatedAmount: 540,
        }),
        rule({
          id: "r-bank",
          paymentSource: "bank",
          estimatedAmount: 800,
        }),
      ],
      entries: [
        entry({ id: "e-manual", source: "manual", amount: 250 }),
        entry({ id: "e-wallet", source: "wallet", amount: 120 }),
        entry({ id: "e-sms", source: "sms", amount: 80 }),
        entry({
          id: "e-bnpl",
          source: "manual",
          amount: 600,
          installments: 3,
        }),
        entry({
          id: "e-pending",
          source: "wallet",
          amount: 90,
          needsConfirmation: true,
        }),
      ],
      statuses: [],
    };

    const exposure = getCreditCardExposure({
      ...inputs,
      monthKey: MONTH_KEY,
    });
    const breakdown = getMonthlyObligationBreakdown({
      ...inputs,
      loans: [],
      monthKey: MONTH_KEY,
    });

    // Canonical invariant: both surfaces read the same number.
    expect(breakdown.creditCardsTotal).toBe(exposure.totalExpectedCharge);
    // And the bank-rule does NOT contaminate the credit lane.
    expect(breakdown.bankFixedTotal).toBe(800);
  });

  it("explanationRows for credit lane mirror exposure.breakdown ids", () => {
    const inputs = {
      rules: [
        rule({
          id: "r-card",
          paymentSource: "card",
          linkedCardId: "card-1",
          estimatedAmount: 540,
        }),
      ],
      entries: [
        entry({ id: "e-wallet", source: "wallet", amount: 120 }),
        entry({ id: "e-sms", source: "sms", amount: 80 }),
      ],
      statuses: [],
    };
    const exposure = getCreditCardExposure({
      ...inputs,
      monthKey: MONTH_KEY,
    });
    const breakdown = getMonthlyObligationBreakdown({
      ...inputs,
      loans: [],
      monthKey: MONTH_KEY,
    });
    const creditIdsFromBreakdown = new Set(
      breakdown.explanationRows
        .filter((r) => r.lane === "creditCards")
        .map((r) => r.id),
    );
    const exposureIds = new Set(exposure.breakdown.map((r) => r.id));
    expect(creditIdsFromBreakdown).toEqual(exposureIds);
  });

  it("paid card-settled rule (status) is excluded from BOTH surfaces", () => {
    const inputs = {
      rules: [
        rule({
          id: "r-card-paid",
          paymentSource: "card",
          linkedCardId: "card-1",
          estimatedAmount: 540,
        }),
      ],
      entries: [],
      statuses: [
        { ruleId: "r-card-paid", monthKey: MONTH_KEY, status: "paid" as const },
      ],
    };
    const exposure = getCreditCardExposure({
      ...inputs,
      monthKey: MONTH_KEY,
    });
    const breakdown = getMonthlyObligationBreakdown({
      ...inputs,
      loans: [],
      monthKey: MONTH_KEY,
    });
    expect(exposure.totalExpectedCharge).toBe(0);
    expect(breakdown.creditCardsTotal).toBe(0);
  });

  it("withdrawal entry with paymentMethod=credit STILL counts as cash, NEVER credit", () => {
    // Withdrawal classification is owned by transactionType, not
    // paymentMethod. Both helpers must drop the entry from credit.
    const inputs = {
      rules: [],
      entries: [
        entry({
          id: "e-wd",
          source: "manual",
          paymentMethod: "credit",
          amount: 800,
          transactionType: "withdrawal" as const,
          withdrawalKind: "atm" as const,
        }),
      ],
      statuses: [],
    };
    const exposure = getCreditCardExposure({
      ...inputs,
      monthKey: MONTH_KEY,
    });
    const breakdown = getMonthlyObligationBreakdown({
      ...inputs,
      loans: [],
      monthKey: MONTH_KEY,
    });
    expect(exposure.totalExpectedCharge).toBe(0);
    expect(breakdown.creditCardsTotal).toBe(0);
    // withdrawals land in cash regardless of paymentMethod.
    expect(breakdown.cashTotal).toBe(800);
  });
});
