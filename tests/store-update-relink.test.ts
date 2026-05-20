import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadStore() {
  vi.resetModules();
  const mod = await import("@/lib/store");
  return mod;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("store.updateExpense", () => {
  it("edits fields without touching confirmedAt / needsConfirmation", async () => {
    const { useFinanceStore } = await loadStore();
    const store = useFinanceStore.getState();

    const res = store.addExpense({
      amount: 100,
      category: "food",
      installments: 1,
      paymentMethod: "credit",
      source: "manual",
      chargeDate: new Date(2026, 4, 5, 10, 0, 0).toISOString(),
    });
    const id = res.entry.id;

    // Mark confirmed via confirmExpense first.
    useFinanceStore.getState().confirmExpense(id, {});
    const confirmedAtBefore = useFinanceStore
      .getState()
      .entries.find((e) => e.id === id)!.confirmedAt;
    expect(confirmedAtBefore).toBeTruthy();

    useFinanceStore.getState().updateExpense(id, {
      amount: 120,
      merchant: "Shufersal",
      installments: 3,
    });

    const e = useFinanceStore.getState().entries.find((x) => x.id === id)!;
    expect(e.amount).toBe(120);
    expect(e.merchant).toBe("Shufersal");
    expect(e.installments).toBe(3);
    expect(e.confirmedAt).toBe(confirmedAtBefore);
    expect(e.needsConfirmation).toBeUndefined();
  });

  it("re-runs matching when category changes — unlinks old, links new", async () => {
    const { useFinanceStore } = await loadStore();
    const store = useFinanceStore.getState();

    const foodRule = store.addRule({
      label: "מסעדה חודשית",
      category: "food",
      estimatedAmount: 200,
      dayOfMonth: 5,
      keywords: [],
    });
    const billsRule = useFinanceStore.getState().addRule({
      label: "חשמל",
      category: "bills",
      estimatedAmount: 200,
      dayOfMonth: 5,
      keywords: [],
    });

    const res = useFinanceStore.getState().addExpense({
      amount: 200,
      category: "food",
      installments: 1,
      paymentMethod: "credit",
      source: "manual",
      chargeDate: new Date(2026, 4, 5, 10, 0, 0).toISOString(),
    });
    const id = res.entry.id;
    expect(res.matched?.id).toBe(foodRule.id);

    useFinanceStore
      .getState()
      .updateExpense(id, { category: "bills" });

    const e = useFinanceStore.getState().entries.find((x) => x.id === id)!;
    expect(e.matchedRuleId).toBe(billsRule.id);

    const statuses = useFinanceStore.getState().statuses;
    const foodStatus = statuses.find((s) => s.ruleId === foodRule.id);
    const billsStatus = statuses.find((s) => s.ruleId === billsRule.id);
    expect(foodStatus?.status).toBe("pending");
    expect(billsStatus?.status).toBe("paid");
    expect(billsStatus?.matchedExpenseId).toBe(id);
  });

  it("returns undefined for unknown id", async () => {
    const { useFinanceStore } = await loadStore();
    const out = useFinanceStore
      .getState()
      .updateExpense("does-not-exist", { amount: 1 });
    expect(out).toBeUndefined();
  });

  it("updates paymentMethod + accountId", async () => {
    const { useFinanceStore } = await loadStore();
    const store = useFinanceStore.getState();

    const card = store.addAccount({
      kind: "card",
      label: "כאל",
      issuer: "cal",
      cardLast4: "1234",
    });

    const res = useFinanceStore.getState().addExpense({
      amount: 50,
      category: "food",
      installments: 1,
      paymentMethod: "cash",
      source: "manual",
      chargeDate: new Date(2026, 4, 5).toISOString(),
    });

    useFinanceStore.getState().updateExpense(res.entry.id, {
      paymentMethod: "credit",
      accountId: card.id,
    });

    const e = useFinanceStore
      .getState()
      .entries.find((x) => x.id === res.entry.id)!;
    expect(e.paymentMethod).toBe("credit");
    expect(e.accountId).toBe(card.id);
  });

  it("clears accountId when sent empty string", async () => {
    const { useFinanceStore } = await loadStore();
    const store = useFinanceStore.getState();

    const card = store.addAccount({
      kind: "card",
      label: "כאל",
      issuer: "cal",
      cardLast4: "1234",
    });

    const res = useFinanceStore.getState().addExpense({
      amount: 50,
      category: "food",
      installments: 1,
      paymentMethod: "credit",
      source: "manual",
      accountId: card.id,
      chargeDate: new Date(2026, 4, 5).toISOString(),
    });
    expect(res.entry.accountId).toBe(card.id);

    useFinanceStore
      .getState()
      .updateExpense(res.entry.id, { accountId: "" });

    const e = useFinanceStore
      .getState()
      .entries.find((x) => x.id === res.entry.id)!;
    expect(e.accountId).toBeUndefined();
  });
});

describe("store.relinkExpense", () => {
  it("manually pins an entry to a rule + updates statuses", async () => {
    const { useFinanceStore } = await loadStore();
    const store = useFinanceStore.getState();

    const rule = store.addRule({
      label: "Netflix",
      category: "entertainment",
      estimatedAmount: 70,
      dayOfMonth: 10,
      keywords: ["netflix"],
    });

    // Entry that doesn't auto-match (different category, no keyword).
    const res = useFinanceStore.getState().addExpense({
      amount: 70,
      category: "other",
      installments: 1,
      paymentMethod: "credit",
      source: "manual",
      chargeDate: new Date(2026, 4, 10, 10, 0, 0).toISOString(),
    });
    expect(res.matched).toBeUndefined();

    useFinanceStore.getState().relinkExpense(res.entry.id, rule.id);

    const e = useFinanceStore
      .getState()
      .entries.find((x) => x.id === res.entry.id)!;
    expect(e.matchedRuleId).toBe(rule.id);

    const status = useFinanceStore
      .getState()
      .statuses.find((s) => s.ruleId === rule.id);
    expect(status?.status).toBe("paid");
    expect(status?.matchedExpenseId).toBe(res.entry.id);
  });

  it("unlinks (ruleId = null) and reverts status to pending", async () => {
    const { useFinanceStore } = await loadStore();
    const store = useFinanceStore.getState();

    const rule = store.addRule({
      label: "חשמל",
      category: "bills",
      estimatedAmount: 400,
      dayOfMonth: 7,
      keywords: [],
    });

    const res = useFinanceStore.getState().addExpense({
      amount: 400,
      category: "bills",
      installments: 1,
      paymentMethod: "credit",
      source: "manual",
      chargeDate: new Date(2026, 4, 7, 10, 0, 0).toISOString(),
    });
    expect(res.matched?.id).toBe(rule.id);

    useFinanceStore.getState().relinkExpense(res.entry.id, null);

    const e = useFinanceStore
      .getState()
      .entries.find((x) => x.id === res.entry.id)!;
    expect(e.matchedRuleId).toBeUndefined();

    const status = useFinanceStore
      .getState()
      .statuses.find((s) => s.ruleId === rule.id);
    expect(status?.status).toBe("pending");
    expect(status?.matchedExpenseId).toBeUndefined();
  });
});
