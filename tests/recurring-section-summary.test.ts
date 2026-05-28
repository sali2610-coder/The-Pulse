// Phase 270 — recurring section summary contract.
//
// Locks the derivation that drives the default-collapsed header of
// the "חיובים שיורדים אוטומטית כל חודש" section: source count,
// monthly total, anomaly counts, tone.

import { describe, expect, it } from "vitest";

import { buildRecurringSectionSummary } from "@/lib/recurring-section-summary";
import type { ExpenseEntry, RecurringRule } from "@/types/finance";

function rule(o: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: "r-electric",
    label: "חשמל",
    category: "bills",
    estimatedAmount: 400,
    dayOfMonth: 10,
    keywords: [],
    active: true,
    // Recent createdAt so the dormant detector's "too new to judge"
    // guard skips these rules and the tone stays at "info" for the
    // quiet-state expectations below.
    createdAt: "2026-04-01T00:00:00.000Z",
    ...o,
  };
}

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
    ...o,
  };
}

describe("buildRecurringSectionSummary — quiet state", () => {
  it("counts active open-ended rules + installment entries, sums monthly total", () => {
    const r1 = rule();
    const r2 = rule({ id: "r-rent", label: "שכ״ד", estimatedAmount: 5000 });
    const e = entry();
    const out = buildRecurringSectionSummary({
      entries: [e],
      rules: [r1, r2],
      statuses: [],
      monthKey: "2026-05",
    });
    expect(out.sourceCount).toBe(3);
    expect(out.monthlyTotal).toBe(400 + 5000 + 3600 / 12);
    expect(out.tone).toBe("info");
    expect(out.insights.total).toBe(0);
  });

  it("skips inactive rules", () => {
    const r = rule({ active: false });
    const out = buildRecurringSectionSummary({
      entries: [],
      rules: [r],
      statuses: [],
      monthKey: "2026-05",
    });
    expect(out.sourceCount).toBe(0);
    expect(out.monthlyTotal).toBe(0);
  });

  it("skips installment entries whose monthKey is outside the plan", () => {
    const e = entry({ chargeDate: "2026-01-10T12:00:00.000Z" });
    const out = buildRecurringSectionSummary({
      entries: [e],
      rules: [],
      statuses: [],
      monthKey: "2027-12",
    });
    expect(out.sourceCount).toBe(0);
  });
});

describe("buildRecurringSectionSummary — ending soon", () => {
  it("flags installment entries with one slice remaining", () => {
    // 12-installment plan starting Jan 2026 → Dec 2026 is the last
    // payment (remaining=0). Nov is the second-to-last (remaining=1).
    const e = entry();
    const nov = buildRecurringSectionSummary({
      entries: [e],
      rules: [],
      statuses: [],
      monthKey: "2026-11",
    });
    expect(nov.insights.endingSoon).toBe(1);
    expect(nov.tone).toBe("warn");
  });

  it("flags installment rules with last payment this month", () => {
    const r = rule({
      id: "r-couch",
      installmentTotal: 6,
      startMonth: 1,
      startYear: 2026,
      estimatedAmount: 500,
    });
    const out = buildRecurringSectionSummary({
      entries: [],
      rules: [r],
      statuses: [],
      monthKey: "2026-06",
    });
    expect(out.insights.endingSoon).toBe(1);
  });

  it("does not flag mid-plan installments", () => {
    const e = entry();
    const may = buildRecurringSectionSummary({
      entries: [e],
      rules: [],
      statuses: [],
      monthKey: "2026-05",
    });
    expect(may.insights.endingSoon).toBe(0);
    expect(may.tone).toBe("info");
  });
});

describe("buildRecurringSectionSummary — tone", () => {
  it("warn when any insight > 0", () => {
    const e = entry();
    const out = buildRecurringSectionSummary({
      entries: [e],
      rules: [],
      statuses: [],
      monthKey: "2026-12",
    });
    // Last slice of the plan — endingSoon should fire (remaining=0).
    expect(out.insights.endingSoon).toBe(1);
    expect(out.tone).toBe("warn");
  });

  it("info when totally quiet", () => {
    const out = buildRecurringSectionSummary({
      entries: [],
      rules: [rule()],
      statuses: [],
      monthKey: "2026-05",
    });
    expect(out.tone).toBe("info");
  });
});
