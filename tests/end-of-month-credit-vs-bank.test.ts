// Phase 356 — Canonical EOM credit-vs-bank separation invariants.
//
// User law (verbatim, repeated across phases 352–355):
//
//   "כל הוצאה באשראי, גם ידנית וגם אוטומטית מפוש Wallet, לא יורדת
//    מיד מהבנק. החיוב הזה משויך לכרטיס האשראי, ויחושב כחלק מסך
//    החיוב החודשי של הכרטיס. הסכום הכולל של כל החיובים יורד מהבנק
//    בתאריך החיוב של הכרטיס בלבד."
//
// Four invariants the engine must hold simultaneously:
//
//   1. bank fixed charge on day 10 appears in forecast (bank lane).
//   2. credit expense inside the card does NOT appear as bank fixed.
//   3. credit card total settles once — on the card's payment day.
//   4. no double counting between card items and bank deductions.
//
// Test surface: buildFinancialSnapshot. It is the single source of
// truth every dashboard reader (CFO summary, PulseBar, daily
// allowance, monthly digest) goes through.
//
// Single-source-of-truth helper: isRuleCardSettled. A rule routes via
// the card lane if paymentSource === "card" OR (linkedCardId set AND
// paymentSource not bank/cash).

import { describe, expect, it } from "vitest";

import { buildFinancialSnapshot } from "@/lib/financial-snapshot";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
  RecurringStatus,
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

function card(o: Partial<Account> = {}): Account {
  return {
    id: o.id ?? "card-1",
    kind: "card",
    label: "MAX Gold",
    cardLast4: "1234",
    active: true,
    paymentDay: 2,
    billingDay: 25,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

function rule(o: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: o.id ?? `r-${Math.random().toString(36).slice(2, 8)}`,
    label: "rule",
    category: "education",
    estimatedAmount: 100,
    dayOfMonth: 10,
    keywords: [],
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...o,
  };
}

// Forecast horizon anchor: early in the month so day-10 charges are
// still ahead and credit-routed rules haven't "passed" yet.
const NOW = new Date(2026, 5, 3, 12, 0, 0); // June 3 noon

const BASE = {
  accounts: [bank({ anchorBalance: 10_000 }), card({ id: "card-1" })],
  loans: [] as Loan[],
  incomes: [] as Income[],
  entries: [] as ExpenseEntry[],
  statuses: [] as RecurringStatus[],
  monthlyBudget: 0,
};

describe("EOM forecast — credit vs bank separation (Phase 356)", () => {
  // ──────────────────────────────────────────────────────────────
  // Invariant 1: bank fixed charge on day 10 appears in forecast
  //              (bank lane, debits balance directly).
  // ──────────────────────────────────────────────────────────────
  it("invariant 1 — bank fixed charge on day 10 lands in bank deductions", () => {
    const snap = buildFinancialSnapshot({
      ...BASE,
      rules: [
        rule({
          label: "לימודים",
          estimatedAmount: 1_200,
          dayOfMonth: 10,
          paymentSource: "bank",
        }),
      ],
      now: NOW,
    });
    expect(snap.fixedExpensesUntilNextMonth).toBe(1_200);
    expect(snap.recurringCommitmentsUntilNextMonth).toBe(0);
    // Balance impact: 10,000 − 1,200 = 8,800 (no income, no other
    // commitments). Confirms forecast applies the deduction once.
    expect(snap.projectedBalanceWithoutDiscretionary).toBe(8_800);
  });

  // ──────────────────────────────────────────────────────────────
  // Invariant 2: credit expense inside the card does NOT appear
  //              as a bank fixed deduction.
  // ──────────────────────────────────────────────────────────────
  it("invariant 2 — credit rule (חוג ג'ודו) is NOT in bank fixed", () => {
    const snap = buildFinancialSnapshot({
      ...BASE,
      rules: [
        rule({
          label: "חוג ג'ודו",
          estimatedAmount: 540,
          dayOfMonth: 12,
          paymentSource: "card",
          linkedCardId: "card-1",
        }),
      ],
      now: NOW,
    });
    expect(snap.fixedExpensesUntilNextMonth).toBe(0);
    // Routed to the card-commitments bucket instead — settles on
    // the card payment day, not directly on day 12.
    expect(snap.recurringCommitmentsUntilNextMonth).toBe(540);
  });

  it("invariant 2 (legacy) — linkedCardId-only rule also stays out of bank fixed", () => {
    // Pre-paymentSource rules created in v6 era. They carry
    // linkedCardId but no explicit paymentSource enum — still
    // need to be treated as card-settled.
    const snap = buildFinancialSnapshot({
      ...BASE,
      rules: [
        rule({
          label: "ארנונה (legacy)",
          estimatedAmount: 320,
          dayOfMonth: 10,
          linkedCardId: "card-1",
          // paymentSource intentionally omitted ("unknown" default).
        }),
      ],
      now: NOW,
    });
    expect(snap.fixedExpensesUntilNextMonth).toBe(0);
    expect(snap.recurringCommitmentsUntilNextMonth).toBe(320);
  });

  // ──────────────────────────────────────────────────────────────
  // Invariant 3: credit card total settles ONCE, on the billing
  //              day. Multiple credit rules → ONE consolidated
  //              card commitment number, not N separate ones.
  // ──────────────────────────────────────────────────────────────
  it("invariant 3 — multiple credit rules consolidate into ONE card-commitments figure", () => {
    const snap = buildFinancialSnapshot({
      ...BASE,
      rules: [
        rule({
          id: "r-judo",
          label: "חוג ג'ודו",
          estimatedAmount: 540,
          dayOfMonth: 12,
          paymentSource: "card",
          linkedCardId: "card-1",
        }),
        rule({
          id: "r-arnona",
          label: "ארנונה",
          estimatedAmount: 320,
          dayOfMonth: 15,
          paymentSource: "card",
          linkedCardId: "card-1",
        }),
        rule({
          id: "r-netflix",
          label: "נטפליקס",
          estimatedAmount: 56,
          dayOfMonth: 20,
          paymentSource: "card",
          linkedCardId: "card-1",
        }),
      ],
      now: NOW,
    });
    // ALL three sum into the card lane (540 + 320 + 56 = 916),
    // nothing leaks into bank deductions.
    expect(snap.fixedExpensesUntilNextMonth).toBe(0);
    expect(snap.recurringCommitmentsUntilNextMonth).toBe(916);
    // And the balance debit equals the consolidated total — the
    // card settles ONCE for the full 916, not three separate hits.
    expect(snap.projectedBalanceWithoutDiscretionary).toBe(10_000 - 916);
  });

  // ──────────────────────────────────────────────────────────────
  // Invariant 4: no double counting between card items and bank
  //              deductions. Mixed inputs (some bank, some card,
  //              some future card slices from entries) must each
  //              count exactly once.
  // ──────────────────────────────────────────────────────────────
  it("invariant 4 — mixed bank + card + entry slices all count exactly once", () => {
    const futureSliceDate = new Date(2026, 5, 20, 0, 0, 0); // June 20
    const snap = buildFinancialSnapshot({
      ...BASE,
      rules: [
        // Bank-fixed direct debit — appears in fixed bucket.
        rule({
          id: "r-bank-fixed",
          label: "לימודים",
          estimatedAmount: 1_200,
          dayOfMonth: 10,
          paymentSource: "bank",
        }),
        // Credit-routed rule — appears in card-commitments bucket.
        rule({
          id: "r-card-rule",
          label: "חוג ג'ודו",
          estimatedAmount: 540,
          dayOfMonth: 12,
          paymentSource: "card",
          linkedCardId: "card-1",
        }),
      ],
      // Existing entry with a future slice → also a card commitment.
      entries: [
        {
          id: "e-future-slice",
          amount: 1_000,
          category: "supermarket",
          source: "manual",
          paymentMethod: "credit",
          installments: 1,
          chargeDate: futureSliceDate.toISOString(),
          createdAt: "2026-05-15T10:00:00.000Z",
          accountId: "card-1",
        },
      ],
      now: NOW,
    });

    // Bank lane: only the explicit bank rule.
    expect(snap.fixedExpensesUntilNextMonth).toBe(1_200);
    // Card lane: credit rule + future entry slice. Both count
    // exactly once; the credit rule did NOT also leak into bank.
    expect(snap.recurringCommitmentsUntilNextMonth).toBe(540 + 1_000);
    // Bottom line: 10,000 − 1,200 − 540 − 1,000 = 7,260. If any
    // value double-counted, this would be off by a multiple.
    expect(snap.projectedBalanceWithoutDiscretionary).toBe(7_260);
  });

  // ──────────────────────────────────────────────────────────────
  // Anchor invariant: when a credit-routed rule is moved to bank
  //              after the fact, the deduction flips lanes
  //              cleanly — proves the helper is the only switch.
  // ──────────────────────────────────────────────────────────────
  it("flipping paymentSource bank↔card moves the deduction between lanes", () => {
    const arnonaCard = rule({
      label: "ארנונה",
      estimatedAmount: 320,
      dayOfMonth: 10,
      paymentSource: "card",
      linkedCardId: "card-1",
    });
    const onCard = buildFinancialSnapshot({
      ...BASE,
      rules: [arnonaCard],
      now: NOW,
    });
    expect(onCard.fixedExpensesUntilNextMonth).toBe(0);
    expect(onCard.recurringCommitmentsUntilNextMonth).toBe(320);

    const onBank = buildFinancialSnapshot({
      ...BASE,
      rules: [{ ...arnonaCard, paymentSource: "bank", linkedCardId: undefined }],
      now: NOW,
    });
    expect(onBank.fixedExpensesUntilNextMonth).toBe(320);
    expect(onBank.recurringCommitmentsUntilNextMonth).toBe(0);

    // Crucially: the TOTAL impact on the projected balance is the
    // same either way (320). The lane the deduction sits in
    // shifts, but no money is lost or duplicated.
    expect(onCard.projectedBalanceWithoutDiscretionary).toBe(
      onBank.projectedBalanceWithoutDiscretionary,
    );
  });
});
