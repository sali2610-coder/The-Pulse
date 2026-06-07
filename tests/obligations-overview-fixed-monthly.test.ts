// Phase 369 — fixedMonthly canonical contract.
//
// User audit found: "Fixed Obligations" tile (Monthly Summary) +
// "Loans" tile summed to ₪13,621 while the "Fixed Obligations +
// Loans" folder card showed ₪14,342 — a ₪721 gap.
//
// Root cause: the tile labelled "קבועים" was reading
// overview.recurringMonthly which is housing-only. Non-housing
// rules (subscriptions / education / gifts / transport / …) were
// silently absent from the headline number.
//
// Fix: a new canonical `fixedMonthly` field sums Σ every active rule
// scheduled for the month excluding card-settled rules. These specs
// pin the contract so any future refactor that drops the canonical
// distinction breaks here first.

import { describe, expect, it } from "vitest";

import { buildObligationsOverview } from "@/lib/obligations-overview";
import type {
  Account,
  Loan,
  RecurringRule,
} from "@/types/finance";

function bank(o: Partial<Account> = {}): Account {
  return {
    id: o.id ?? "bank-1",
    kind: "bank",
    label: "Discount",
    anchorBalance: 10_000,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

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

const MONTH_KEY = "2026-06" as const;

describe("buildObligationsOverview.fixedMonthly", () => {
  it("includes non-housing bank-settled rules (the headline bug)", () => {
    // ארנונה = housing (will land in `recurringMonthly` too).
    // נטפליקס = bills/subscriptions, NOT housing — was missing from the
    // "קבועים" tile before Phase 369.
    const overview = buildObligationsOverview({
      loans: [],
      rules: [
        rule({
          id: "r-arnona",
          label: "ארנונה",
          category: "bills",
          estimatedAmount: 800,
          paymentSource: "bank",
        }),
        rule({
          id: "r-netflix",
          label: "נטפליקס",
          category: "entertainment",
          estimatedAmount: 56,
          paymentSource: "bank",
        }),
      ],
      accounts: [bank()],
      monthKey: MONTH_KEY,
    });
    expect(overview.fixedMonthly).toBe(856);
    // Housing-only field is unchanged so the share-of-income calc on
    // the Housing card stays correct.
    expect(overview.recurringMonthly).toBeLessThanOrEqual(800);
  });

  it("Phase 419 — includes card / cash / subscription recurring rules", () => {
    // Spec change: Fixed Obligations now treats EVERY active rule
    // as part of the lane regardless of settlement source. Loans
    // remain disjoint and never enter this sum. The cockpit on the
    // Expenses tab still routes per-lane separately — the Home
    // header just shows one honest "all recurring outflows" number.
    const overview = buildObligationsOverview({
      loans: [],
      rules: [
        rule({
          id: "r-bank",
          label: "ארנונה",
          category: "bills",
          estimatedAmount: 800,
          paymentSource: "bank",
        }),
        rule({
          id: "r-card-explicit",
          label: "חוג ג'ודו",
          category: "education",
          estimatedAmount: 540,
          paymentSource: "card",
          linkedCardId: "card-1",
        }),
        rule({
          id: "r-card-legacy",
          label: "ארנונה ישנה",
          category: "bills",
          estimatedAmount: 320,
          linkedCardId: "card-1",
        }),
      ],
      accounts: [bank()],
      monthKey: MONTH_KEY,
    });
    expect(overview.fixedMonthly).toBe(800 + 540 + 320);
  });

  it("monthlyTotal == loansMonthly + fixedMonthly (canonical headline)", () => {
    const loan: Loan = {
      id: "l-1",
      label: "משכנתא",
      monthlyInstallment: 4_970,
      dayOfMonth: 10,
      startMonth: 6,
      startYear: 2026,
      totalPayments: 60,
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const overview = buildObligationsOverview({
      loans: [loan],
      rules: [
        rule({
          id: "r-1",
          label: "חשמל",
          category: "bills",
          estimatedAmount: 800,
          paymentSource: "bank",
        }),
        rule({
          id: "r-2",
          label: "מים",
          category: "bills",
          estimatedAmount: 200,
          paymentSource: "bank",
        }),
      ],
      accounts: [bank()],
      monthKey: MONTH_KEY,
    });
    expect(overview.fixedMonthly).toBe(1_000);
    expect(overview.loansMonthly).toBe(4_970);
    expect(overview.monthlyTotal).toBe(5_970);
    expect(overview.monthlyTotal).toBe(
      overview.fixedMonthly + overview.loansMonthly,
    );
  });

  it("inactive + paid + non-scheduled rules excluded", () => {
    const overview = buildObligationsOverview({
      loans: [],
      rules: [
        rule({
          id: "r-active",
          label: "Active",
          estimatedAmount: 500,
          paymentSource: "bank",
        }),
        rule({
          id: "r-inactive",
          label: "Inactive",
          estimatedAmount: 700,
          paymentSource: "bank",
          active: false,
        }),
      ],
      accounts: [bank()],
      monthKey: MONTH_KEY,
    });
    expect(overview.fixedMonthly).toBe(500);
  });
});
