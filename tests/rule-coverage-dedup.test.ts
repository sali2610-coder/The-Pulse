// Phase 262 — single canonical event per physical obligation.
//
// When a recurring RULE is matched by an ENTRY, only ONE of them
// must contribute to the forecast / breakdowns. The original
// dedup skipped the rule for the current month only (via paid
// status); future months silently double-counted, especially on
// installment-entry plans that cover many months.

import { describe, expect, it } from "vitest";

import { buildCashFlowBuckets } from "@/lib/cash-flow-bucket";
import { buildCardCategoryBreakdown } from "@/lib/card-category-breakdown";
import { buildCategorySpend } from "@/lib/category-spend";
import { monthsCoveredByMatchedEntries } from "@/lib/rule-coverage";
import type {
  Account,
  ExpenseEntry,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";

function bank(): Account {
  return {
    id: "b1",
    kind: "bank",
    label: "Discount",
    anchorBalance: 10000,
    anchorUpdatedAt: "2026-05-26T00:00:00.000Z",
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
  };
}

function card(): Account {
  return {
    id: "c-isra",
    kind: "card",
    label: "Isracard",
    issuer: "isracard",
    cardLast4: "1234",
    billingDay: 25,
    paymentDay: 10,
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
  };
}

function rule(o: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: "r-spotify",
    label: "Spotify",
    category: "entertainment",
    estimatedAmount: 30,
    dayOfMonth: 12,
    keywords: [],
    paymentSource: "card",
    linkedCardId: "c-isra",
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...o,
  };
}

function entry(o: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: "e1",
    amount: 30,
    category: "entertainment",
    source: "manual",
    paymentMethod: "credit",
    installments: 1,
    chargeDate: "2026-05-12T12:00:00.000Z",
    createdAt: "2026-05-12T12:00:00.000Z",
    accountId: "c-isra",
    ...o,
  };
}

const NOW = new Date(2026, 4, 3, 12, 0, 0); // 2026-05-03

describe("rule-coverage dedup — canonical single emission", () => {
  it("matched simple rule + entry → only the entry fires this month", () => {
    const r = rule({ id: "r-spotify" });
    const e = entry({
      id: "e-spotify-may",
      matchedRuleId: "r-spotify",
      chargeDate: "2026-05-12T12:00:00.000Z",
    });
    const statuses: RecurringStatus[] = [
      {
        ruleId: "r-spotify",
        monthKey: "2026-05",
        status: "paid",
        matchedExpenseId: "e-spotify-may",
        actualAmount: 30,
      },
    ];
    const cat = buildCategorySpend({
      entries: [e],
      rules: [r],
      statuses,
      monthKey: "2026-05",
    });
    const ent = cat.byCategory.find((c) => c.category === "entertainment");
    if (!ent) throw new Error("entertainment missing");
    // Either recurring OR discretionary — never BOTH for the same charge.
    expect(ent.total).toBe(30);
    expect(ent.items.length).toBe(1);
  });

  it("multi-month installment plan: rule does NOT also fire across months covered by the entry", () => {
    // Rule + entry both cover Jan..Dec 2026 as a 12-payment plan.
    const r = rule({
      id: "r-laptop",
      label: "Laptop",
      estimatedAmount: 600,
      installmentTotal: 12,
      startMonth: 1,
      startYear: 2026,
      dayOfMonth: 10,
    });
    const e = entry({
      id: "e-laptop",
      merchant: "Laptop",
      amount: 7200, // 12 × 600
      installments: 12,
      chargeDate: "2026-01-10T12:00:00.000Z",
      matchedRuleId: "r-laptop",
    });
    const buckets = buildCashFlowBuckets({
      accounts: [bank(), card()],
      loans: [],
      rules: [r],
      statuses: [],
      entries: [e],
      now: NOW,
      windowDays: 90,
    });
    const cardBucket = buckets.buckets.find((b) => b.source === "card");
    if (!cardBucket) throw new Error("card bucket missing");
    // Without the fix: rule emits future months AND entry slices emit
    // the same months → duplicated. With the fix: only entry slices.
    // 90-day window starting May 3 includes May, Jun, Jul, Aug
    // settlements — but only the matched-entry slices, not the rule.
    const ruleEmitted = cardBucket.obligations.filter(
      (o) => o.refId === "r-laptop",
    );
    expect(ruleEmitted).toHaveLength(0);
    const entryEmitted = cardBucket.obligations.filter((o) =>
      o.refId.startsWith("entry:"),
    );
    expect(entryEmitted.length).toBeGreaterThan(0);
    // Each emitted slice should be the SLICE amount (600), not the
    // full entry amount.
    for (const o of entryEmitted) expect(o.amount).toBe(600);
  });

  it("card-category-breakdown also dedups — no double-count per card", () => {
    const r = rule({
      id: "r-insurance",
      label: "Insurance",
      category: "bills",
      estimatedAmount: 800,
      dayOfMonth: 14,
    });
    const e = entry({
      id: "e-insurance-may",
      merchant: "Insurance",
      category: "bills",
      amount: 800,
      installments: 1,
      matchedRuleId: "r-insurance",
      chargeDate: "2026-05-14T12:00:00.000Z",
    });
    const report = buildCardCategoryBreakdown({
      accounts: [bank(), card()],
      loans: [],
      rules: [r],
      statuses: [
        {
          ruleId: "r-insurance",
          monthKey: "2026-05",
          status: "paid",
          matchedExpenseId: "e-insurance-may",
          actualAmount: 800,
        },
      ],
      entries: [e],
      now: NOW,
      windowDays: 60,
    });
    const isracard = report.cards.find((c) => c.cardId === "c-isra");
    if (!isracard) throw new Error("Isracard bucket missing");
    // 800 once — not 1600.
    const billsGroup = isracard.categories.find((c) => c.category === "bills");
    expect(billsGroup?.total).toBe(800);
    // No rule item AND entry item for the same month.
    const sameMonth = billsGroup!.items.filter((it) =>
      it.effectiveCashAt.startsWith("2026-"),
    );
    // Both items would have the same effectiveCashAt if double-counted;
    // here we expect exactly one cash impact for May.
    const mayItems = sameMonth.filter((it) =>
      it.effectiveCashAt.startsWith("2026-06"),
    );
    expect(mayItems.length).toBe(1);
  });

  it("unmatched rule + standalone entry → both still count (different events)", () => {
    // Two truly different physical obligations: a rule that has no
    // matched entry + an entry that matches no rule. Both should
    // appear independently.
    const r = rule({
      id: "r-utilities",
      label: "Utilities",
      category: "bills",
      estimatedAmount: 400,
    });
    const e = entry({
      id: "e-shopping-may",
      category: "shopping",
      amount: 200,
      chargeDate: "2026-05-14T12:00:00.000Z",
    });
    const buckets = buildCashFlowBuckets({
      accounts: [bank(), card()],
      loans: [],
      rules: [r],
      statuses: [],
      entries: [e],
      now: NOW,
      windowDays: 60,
    });
    const allRefs = buckets.buckets.flatMap((b) =>
      b.obligations.map((o) => o.refId),
    );
    expect(allRefs).toContain("r-utilities");
    expect(allRefs.some((id) => id.startsWith("entry:"))).toBe(true);
  });

  it("monthsCoveredByMatchedEntries returns a per-rule MonthKey set", () => {
    const e = entry({
      id: "e-inst",
      installments: 6,
      amount: 600,
      chargeDate: "2026-05-10T12:00:00.000Z",
      matchedRuleId: "r-x",
    });
    const cov = monthsCoveredByMatchedEntries({
      rules: [rule({ id: "r-x" })],
      entries: [e],
      now: NOW,
      windowDays: 200,
    });
    const months = cov.get("r-x");
    expect(months).toBeDefined();
    // 6 payment plan starting May → May + Jun + Jul + Aug + Sep + Oct.
    expect(months!.size).toBeGreaterThanOrEqual(5);
    expect(months!.has("2026-05")).toBe(true);
    expect(months!.has("2026-09")).toBe(true);
  });
});
