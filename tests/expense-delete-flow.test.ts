// Phase 258 — delete + restore contract.
//
// Confirms:
//   • deleteExpense drops the row + summaries recompute via the
//     existing aggregators (no UI cache).
//   • restoreExpense puts the exact same row back (same id, same
//     accountId, same flags) so the dependent breakdowns line up
//     with the pre-delete state.
//   • restoreExpense is idempotent — calling it twice does not
//     create a duplicate.
//   • Deleting a row that was matched to a recurring rule reverts
//     the status to pending.

import { beforeEach, describe, expect, it } from "vitest";

import { useFinanceStore } from "@/lib/store";
import { buildCardCategoryBreakdown } from "@/lib/card-category-breakdown";
import { buildCategorySpend } from "@/lib/category-spend";
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

function card(): Account {
  return {
    id: "c-isra",
    kind: "card",
    label: "Isracard",
    issuer: "isracard",
    cardLast4: "1234",
    active: true,
    billingDay: 25,
    paymentDay: 10,
    createdAt: "2025-01-01T00:00:00.000Z",
  };
}

const NOW = new Date(2026, 4, 26, 12, 0, 0); // 2026-05-26

beforeEach(() => {
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

describe("delete + undo", () => {
  it("deleteExpense removes the row and the category total goes to 0", () => {
    const { addExpense, deleteExpense } = useFinanceStore.getState();
    const { entry } = addExpense({
      amount: 250,
      category: "food",
      installments: 1,
      paymentMethod: "credit",
      source: "manual",
      accountId: "c-isra",
      chargeDate: new Date(2026, 4, 5, 12, 0, 0).toISOString(),
    });

    let cat = buildCategorySpend({
      entries: useFinanceStore.getState().entries,
      rules: [],
      statuses: [],
      monthKey: "2026-05",
    });
    expect(cat.byCategory).toHaveLength(1);
    expect(cat.byCategory[0].total).toBe(250);

    deleteExpense(entry.id);

    cat = buildCategorySpend({
      entries: useFinanceStore.getState().entries,
      rules: [],
      statuses: [],
      monthKey: "2026-05",
    });
    expect(cat.byCategory).toHaveLength(0);
    expect(useFinanceStore.getState().entries).toHaveLength(0);
  });

  it("restoreExpense re-inserts the EXACT original entry — same id", () => {
    const { addExpense, deleteExpense, restoreExpense } =
      useFinanceStore.getState();
    const { entry } = addExpense({
      amount: 100,
      category: "transport",
      installments: 1,
      paymentMethod: "credit",
      source: "manual",
      accountId: "c-isra",
      chargeDate: new Date(2026, 4, 26, 12, 0, 0).toISOString(),
    });
    const snapshot = useFinanceStore
      .getState()
      .entries.find((e) => e.id === entry.id);
    if (!snapshot) throw new Error("snapshot missing");

    deleteExpense(entry.id);
    expect(useFinanceStore.getState().entries).toHaveLength(0);

    restoreExpense(snapshot);
    const restored = useFinanceStore.getState().entries;
    expect(restored).toHaveLength(1);
    expect(restored[0].id).toBe(snapshot.id);
    expect(restored[0].amount).toBe(snapshot.amount);
    expect(restored[0].category).toBe(snapshot.category);
    expect(restored[0].accountId).toBe(snapshot.accountId);
  });

  it("restoreExpense is idempotent — calling twice does not duplicate", () => {
    const { addExpense, deleteExpense, restoreExpense } =
      useFinanceStore.getState();
    const { entry } = addExpense({
      amount: 50,
      category: "food",
      installments: 1,
      paymentMethod: "credit",
      source: "manual",
      accountId: "c-isra",
      chargeDate: new Date(2026, 4, 26, 12, 0, 0).toISOString(),
    });
    const snapshot = useFinanceStore
      .getState()
      .entries.find((e) => e.id === entry.id)!;
    deleteExpense(entry.id);
    restoreExpense(snapshot);
    restoreExpense(snapshot);
    expect(useFinanceStore.getState().entries).toHaveLength(1);
  });

  it("card-bucket total recovers exactly after delete + restore", () => {
    const { addExpense, deleteExpense, restoreExpense } =
      useFinanceStore.getState();
    const { entry: a } = addExpense({
      amount: 300,
      category: "shopping",
      installments: 1,
      paymentMethod: "credit",
      source: "manual",
      accountId: "c-isra",
      chargeDate: new Date(2026, 4, 26, 12, 0, 0).toISOString(),
    });
    const { entry: b } = addExpense({
      amount: 120,
      category: "shopping",
      installments: 1,
      paymentMethod: "credit",
      source: "manual",
      accountId: "c-isra",
      chargeDate: new Date(2026, 4, 27, 12, 0, 0).toISOString(),
    });

    const before = buildCardCategoryBreakdown({
      accounts: useFinanceStore.getState().accounts,
      loans: [],
      rules: [],
      statuses: [],
      entries: useFinanceStore.getState().entries,
      now: NOW,
    });
    expect(before.cards[0].total).toBe(420);

    const snapshotA = useFinanceStore
      .getState()
      .entries.find((e) => e.id === a.id)!;
    deleteExpense(a.id);

    const afterDelete = buildCardCategoryBreakdown({
      accounts: useFinanceStore.getState().accounts,
      loans: [],
      rules: [],
      statuses: [],
      entries: useFinanceStore.getState().entries,
      now: NOW,
    });
    expect(afterDelete.cards[0].total).toBe(120);

    restoreExpense(snapshotA);
    const afterRestore = buildCardCategoryBreakdown({
      accounts: useFinanceStore.getState().accounts,
      loans: [],
      rules: [],
      statuses: [],
      entries: useFinanceStore.getState().entries,
      now: NOW,
    });
    expect(afterRestore.cards[0].total).toBe(420);

    // No mention of `b` was touched.
    expect(
      useFinanceStore
        .getState()
        .entries.find((e) => e.id === b.id)?.amount,
    ).toBe(120);
  });

  it("deleting a matched expense reverts the recurring status to pending", () => {
    useFinanceStore.setState((s) => ({
      ...s,
      rules: [
        {
          id: "r-electric",
          label: "חשמל",
          category: "bills",
          estimatedAmount: 400,
          dayOfMonth: 12,
          keywords: ["חשמל"],
          paymentSource: "bank",
          active: true,
          createdAt: "2025-01-01T00:00:00.000Z",
        },
      ],
    }));
    const { addExpense, deleteExpense } = useFinanceStore.getState();
    const { entry, matched } = addExpense({
      amount: 410,
      category: "bills",
      installments: 1,
      paymentMethod: "cash",
      source: "manual",
      chargeDate: new Date(2026, 4, 12, 12, 0, 0).toISOString(),
      merchant: "חשמל",
    });
    expect(matched?.id).toBe("r-electric");
    const after = useFinanceStore.getState().statuses;
    expect(
      after.find((s) => s.ruleId === "r-electric")?.status,
    ).toBe("paid");

    deleteExpense(entry.id);
    const reverted = useFinanceStore.getState().statuses;
    expect(
      reverted.find((s) => s.ruleId === "r-electric")?.status,
    ).toBe("pending");
    expect(
      reverted.find((s) => s.ruleId === "r-electric")?.matchedExpenseId,
    ).toBeUndefined();
  });
});
