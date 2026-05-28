// Phase 269 — installment progress lookup for category drilldown
// rows. Locks the contract that "תשלום 3 מתוך 12" + monthly +
// original-total derive correctly for both entry-sourced and
// rule-sourced rows.

import { describe, expect, it } from "vitest";

import {
  installmentMetaForRefId,
  installmentMetaForSource,
} from "@/lib/installment-meta";
import type { ExpenseEntry, RecurringRule } from "@/types/finance";

function entry(o: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: "e-laptop",
    amount: 3600,
    category: "shopping",
    source: "manual",
    paymentMethod: "credit",
    installments: 12,
    chargeDate: "2026-01-10T12:00:00.000Z",
    createdAt: "2026-01-10T12:00:00.000Z",
    accountId: "c1",
    ...o,
  };
}

function rule(o: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: "r-couch",
    label: "Couch",
    category: "shopping",
    estimatedAmount: 500,
    dayOfMonth: 5,
    keywords: [],
    paymentSource: "card",
    linkedCardId: "c1",
    installmentTotal: 6,
    startMonth: 2,
    startYear: 2026,
    active: true,
    createdAt: "2025-12-01T00:00:00.000Z",
    ...o,
  };
}

describe("installmentMetaForRefId — entry-sourced row", () => {
  it("returns current=3, total=12, remaining=9 for slice 2", () => {
    const e = entry();
    const meta = installmentMetaForRefId({
      refId: `entry:${e.id}:2`,
      monthKey: "2026-03",
      entries: [e],
      rules: [],
    });
    expect(meta).not.toBeNull();
    expect(meta?.current).toBe(3);
    expect(meta?.total).toBe(12);
    expect(meta?.remaining).toBe(9);
    expect(meta?.monthly).toBeCloseTo(300, 2); // 3600 / 12
    expect(meta?.originalTotal).toBe(3600);
  });

  it("returns null for a one-shot entry (installments=1)", () => {
    const e = entry({ id: "e-one", installments: 1, amount: 500 });
    const meta = installmentMetaForRefId({
      refId: `entry:${e.id}:0`,
      monthKey: "2026-01",
      entries: [e],
      rules: [],
    });
    expect(meta).toBeNull();
  });

  it("returns null when entry id doesn't exist", () => {
    const meta = installmentMetaForRefId({
      refId: "entry:nope:0",
      monthKey: "2026-01",
      entries: [],
      rules: [],
    });
    expect(meta).toBeNull();
  });
});

describe("installmentMetaForRefId — rule-sourced row", () => {
  it("derives current installment from the rule schedule", () => {
    const r = rule();
    // Rule starts Feb 2026 → April 2026 = 3rd payment.
    const meta = installmentMetaForRefId({
      refId: `rule:${r.id}`,
      monthKey: "2026-04",
      entries: [],
      rules: [r],
    });
    expect(meta?.current).toBe(3);
    expect(meta?.total).toBe(6);
    expect(meta?.remaining).toBe(3);
    expect(meta?.monthly).toBe(500);
    expect(meta?.originalTotal).toBe(3000);
  });

  it("returns null for a rule that's a regular bill (no installmentTotal)", () => {
    const r = rule({ id: "r-electric", installmentTotal: undefined });
    const meta = installmentMetaForRefId({
      refId: `rule:${r.id}`,
      monthKey: "2026-04",
      entries: [],
      rules: [r],
    });
    expect(meta).toBeNull();
  });
});

describe("installmentMetaForSource — category-spend row shape", () => {
  it("computes slice index from chargeDate offset for entry source", () => {
    const e = entry();
    const meta = installmentMetaForSource({
      source: "entry",
      id: e.id,
      monthKey: "2026-05",
      entries: [e],
      rules: [],
    });
    // Jan + 4 months = May → 5th payment.
    expect(meta?.current).toBe(5);
    expect(meta?.total).toBe(12);
  });

  it("returns null when monthKey is before chargeDate", () => {
    const e = entry();
    const meta = installmentMetaForSource({
      source: "entry",
      id: e.id,
      monthKey: "2025-12",
      entries: [e],
      rules: [],
    });
    expect(meta).toBeNull();
  });

  it("returns null when monthKey is past the last installment", () => {
    const e = entry();
    const meta = installmentMetaForSource({
      source: "entry",
      id: e.id,
      monthKey: "2027-06",
      entries: [e],
      rules: [],
    });
    expect(meta).toBeNull();
  });

  it("rule source delegates to ruleSchedule paymentNumber", () => {
    const r = rule();
    const meta = installmentMetaForSource({
      source: "rule",
      id: r.id,
      monthKey: "2026-03",
      entries: [],
      rules: [r],
    });
    expect(meta?.current).toBe(2);
    expect(meta?.total).toBe(6);
  });
});
