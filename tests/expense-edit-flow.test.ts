// Phase 253 — every edit affordance recalculates the per-card +
// per-category breakdowns and never duplicates the row.

import { describe, expect, it, beforeEach } from "vitest";

import { buildCardCategoryBreakdown } from "@/lib/card-category-breakdown";
import { buildCategorySpend } from "@/lib/category-spend";
import { useFinanceStore } from "@/lib/store";
import type { Account } from "@/types/finance";

function bank(): Account {
  return {
    id: "b1",
    kind: "bank",
    label: "Discount",
    anchorBalance: 5000,
    anchorUpdatedAt: "2026-05-26T00:00:00.000Z",
    active: true,
    createdAt: "2025-01-01T00:00:00.000Z",
  };
}

function card(overrides: Partial<Account> = {}): Account {
  return {
    id: overrides.id ?? "c-isra",
    kind: "card",
    label: "Isracard",
    issuer: "isracard",
    cardLast4: "1234",
    active: true,
    billingDay: 25,
    paymentDay: 10,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const NOW = new Date(2026, 4, 26, 12, 0, 0); // 2026-05-26

beforeEach(() => {
  // Reset the singleton store between tests.
  useFinanceStore.setState({
    entries: [],
    rules: [],
    statuses: [],
    accounts: [bank(), card()],
    loans: [],
    incomes: [],
    monthlyBudget: 0,
    budgetMode: "manual",
    budgetSafetyBuffer: 0,
    budgetSettingsUpdatedAt: 0,
    lastSyncedAt: 0,
    audioEnabled: true,
    hasHydrated: true,
  });
});

describe("expense edit flow recalculates summaries", () => {
  it("editing amount updates the card-bucket total", () => {
    const { addExpense, updateExpense } = useFinanceStore.getState();
    const { entry } = addExpense({
      amount: 100,
      category: "food",
      installments: 1,
      paymentMethod: "credit",
      source: "manual",
      accountId: "c-isra",
      chargeDate: new Date(2026, 4, 26, 12, 0, 0).toISOString(),
    });

    const before = buildCardCategoryBreakdown({
      accounts: useFinanceStore.getState().accounts,
      loans: [],
      rules: [],
      statuses: [],
      entries: useFinanceStore.getState().entries,
      now: NOW,
    });
    expect(before.cards[0]?.total).toBe(100);

    updateExpense(entry.id, { amount: 250 });

    const after = buildCardCategoryBreakdown({
      accounts: useFinanceStore.getState().accounts,
      loans: [],
      rules: [],
      statuses: [],
      entries: useFinanceStore.getState().entries,
      now: NOW,
    });
    expect(after.cards[0]?.total).toBe(250);
    expect(useFinanceStore.getState().entries).toHaveLength(1);
  });

  it("editing category moves the row to the new category bucket", () => {
    const { addExpense, updateExpense } = useFinanceStore.getState();
    const { entry } = addExpense({
      amount: 80,
      category: "food",
      installments: 1,
      paymentMethod: "credit",
      source: "manual",
      accountId: "c-isra",
      chargeDate: new Date(2026, 4, 5, 12, 0, 0).toISOString(),
    });

    let report = buildCategorySpend({
      entries: useFinanceStore.getState().entries,
      rules: [],
      statuses: [],
      monthKey: "2026-05",
    });
    expect(report.byCategory.map((c) => c.category)).toContain("food");
    expect(report.byCategory.map((c) => c.category)).not.toContain("health");

    updateExpense(entry.id, { category: "health" });
    report = buildCategorySpend({
      entries: useFinanceStore.getState().entries,
      rules: [],
      statuses: [],
      monthKey: "2026-05",
    });
    expect(report.byCategory.map((c) => c.category)).not.toContain("food");
    expect(report.byCategory.map((c) => c.category)).toContain("health");
  });

  it("editing card-account moves the row to the new card bucket", () => {
    useFinanceStore.setState((s) => ({
      accounts: [...s.accounts, card({ id: "c-cal", label: "CAL", cardLast4: "5678" })],
    }));
    const { addExpense, updateExpense } = useFinanceStore.getState();
    const { entry } = addExpense({
      amount: 120,
      category: "shopping",
      installments: 1,
      paymentMethod: "credit",
      source: "manual",
      accountId: "c-isra",
      chargeDate: new Date(2026, 4, 26, 12, 0, 0).toISOString(),
    });

    let report = buildCardCategoryBreakdown({
      accounts: useFinanceStore.getState().accounts,
      loans: [],
      rules: [],
      statuses: [],
      entries: useFinanceStore.getState().entries,
      now: NOW,
    });
    expect(
      report.cards.find((c) => c.cardId === "c-isra")?.total,
    ).toBe(120);
    expect(
      report.cards.find((c) => c.cardId === "c-cal"),
    ).toBeUndefined();

    updateExpense(entry.id, { accountId: "c-cal" });

    report = buildCardCategoryBreakdown({
      accounts: useFinanceStore.getState().accounts,
      loans: [],
      rules: [],
      statuses: [],
      entries: useFinanceStore.getState().entries,
      now: NOW,
    });
    expect(
      report.cards.find((c) => c.cardId === "c-isra"),
    ).toBeUndefined();
    expect(report.cards.find((c) => c.cardId === "c-cal")?.total).toBe(120);
  });

  it("editing installments routes the row to the installments kind", () => {
    const { addExpense, updateExpense } = useFinanceStore.getState();
    const { entry } = addExpense({
      amount: 600,
      category: "shopping",
      installments: 1,
      paymentMethod: "credit",
      source: "manual",
      accountId: "c-isra",
      chargeDate: new Date(2026, 4, 26, 12, 0, 0).toISOString(),
    });

    let report = buildCardCategoryBreakdown({
      accounts: useFinanceStore.getState().accounts,
      loans: [],
      rules: [],
      statuses: [],
      entries: useFinanceStore.getState().entries,
      now: NOW,
    });
    expect(report.cards[0]?.oneTimeTotal).toBe(600);
    expect(report.cards[0]?.installmentsTotal).toBe(0);

    updateExpense(entry.id, { installments: 6 });
    report = buildCardCategoryBreakdown({
      accounts: useFinanceStore.getState().accounts,
      loans: [],
      rules: [],
      statuses: [],
      entries: useFinanceStore.getState().entries,
      now: NOW,
    });
    // 6 installments of 100 each → at least one slice in the window.
    expect(report.cards[0]?.installmentsTotal).toBeGreaterThan(0);
    expect(report.cards[0]?.oneTimeTotal).toBe(0);
  });

  it("edit preserves the original entry id — never creates a duplicate", () => {
    const { addExpense, updateExpense } = useFinanceStore.getState();
    const { entry } = addExpense({
      amount: 100,
      category: "food",
      installments: 1,
      paymentMethod: "credit",
      source: "manual",
      accountId: "c-isra",
      chargeDate: new Date(2026, 4, 26, 12, 0, 0).toISOString(),
    });
    const result = updateExpense(entry.id, {
      amount: 200,
      category: "transport",
      merchant: "Egged",
      installments: 3,
    });
    if (!result) throw new Error("update should succeed");
    expect(result.id).toBe(entry.id);
    expect(useFinanceStore.getState().entries).toHaveLength(1);
    expect(useFinanceStore.getState().entries[0].id).toBe(entry.id);
    expect(useFinanceStore.getState().entries[0].amount).toBe(200);
    expect(useFinanceStore.getState().entries[0].category).toBe("transport");
    expect(useFinanceStore.getState().entries[0].installments).toBe(3);
  });
});
