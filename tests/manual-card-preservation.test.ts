import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ExpenseEntry, RecurringRule } from "@/types/finance";

/**
 * Regression guard: quick expense saved to the wrong card.
 *
 * Two active cards (A, B). A recurring rule 'גז גל' is linked to
 * card A. User adds a manual expense on card B in the same category
 * and near the rule's amount.
 *
 * Pre-fix: addExpense silently auto-matched the entry to the rule,
 * and findCard rerouted the cash impact from card B → card A.
 *
 * Post-fix:
 *   • Manual entries never auto-match a rule (no matchedRuleId).
 *   • findCard prefers entry.accountId for manual entries even if
 *     matchedRuleId is present.
 *   • Non-manual (SMS / auto) entries still auto-match and still
 *     honor rule.linkedCardId for viaCardId routing.
 */

async function loadFreshStore() {
  // Clear persistence between tests without polluting globalThis.
  if (typeof localStorage !== "undefined") localStorage.clear();
  vi.resetModules();
  const mod = await import("@/lib/store");
  const cashMod = await import("@/lib/effective-cash-date");
  return {
    useFinanceStore: mod.useFinanceStore,
    effectiveCashImpacts: cashMod.effectiveCashImpacts,
  };
}

async function seed(): Promise<{
  cardAId: string;
  cardBId: string;
  ruleId: string;
  store: Awaited<ReturnType<typeof loadFreshStore>>["useFinanceStore"];
  effectiveCashImpacts: Awaited<
    ReturnType<typeof loadFreshStore>
  >["effectiveCashImpacts"];
}> {
  const { useFinanceStore, effectiveCashImpacts } = await loadFreshStore();
  const s = useFinanceStore.getState();
  const cardA = s.addAccount({
    kind: "card",
    label: "כרטיס A",
    issuer: "cal",
    cardLast4: "1111",
    color: "#22D3EE",
  });
  const cardB = s.addAccount({
    kind: "card",
    label: "כרטיס B",
    issuer: "max",
    cardLast4: "2222",
    color: "#A78BFA",
  });
  const rule = s.addRule({
    label: "גז גל",
    category: "transport",
    estimatedAmount: 350,
    dayOfMonth: 20,
    keywords: ["גז"],
    paymentSource: "card",
    linkedCardId: cardA.id,
  });
  return {
    cardAId: cardA.id,
    cardBId: cardB.id,
    ruleId: rule.id,
    store: useFinanceStore,
    effectiveCashImpacts,
  };
}

beforeEach(() => {
  if (typeof localStorage !== "undefined") localStorage.clear();
});
afterEach(() => {
  if (typeof localStorage !== "undefined") localStorage.clear();
});

describe("Regression · manual expense preserves selected card", () => {
  it("does NOT auto-match a rule when source is manual", async () => {
    const { cardBId, store } = await seed();
    const result = store.getState().addExpense({
      amount: 340,
      category: "transport",
      installments: 1,
      paymentMethod: "credit",
      source: "manual",
      accountId: cardBId,
      chargeDate: new Date(2026, 4, 12).toISOString(),
    });
    expect(result.entry.matchedRuleId).toBeUndefined();
    expect(result.entry.accountId).toBe(cardBId);
    expect(result.matched).toBeUndefined();
  });

  it("routes cash impact to the manually selected card, not the rule's linkedCardId", async () => {
    const { cardBId, store, effectiveCashImpacts } = await seed();
    const result = store.getState().addExpense({
      amount: 340,
      category: "transport",
      installments: 1,
      paymentMethod: "credit",
      source: "manual",
      accountId: cardBId,
      chargeDate: new Date(2026, 4, 12).toISOString(),
    });
    const impacts = effectiveCashImpacts({
      entry: result.entry,
      accounts: store.getState().accounts,
      rules: store.getState().rules,
    });
    expect(impacts.length).toBeGreaterThan(0);
    expect(impacts[0].viaCardId).toBe(cardBId);
  });

  it("still routes SMS/auto entries via the matched rule linkedCardId", async () => {
    const { cardAId, ruleId, store, effectiveCashImpacts } = await seed();
    const result = store.getState().addExpense({
      amount: 340,
      category: "transport",
      installments: 1,
      paymentMethod: "credit",
      source: "auto",
      externalId: "auto:1",
      chargeDate: new Date(2026, 4, 12).toISOString(),
    });
    expect(result.entry.matchedRuleId).toBe(ruleId);
    const impacts = effectiveCashImpacts({
      entry: result.entry,
      accounts: store.getState().accounts,
      rules: store.getState().rules,
    });
    expect(impacts.length).toBeGreaterThan(0);
    expect(impacts[0].viaCardId).toBe(cardAId);
  });

  it("prefers explicit manual accountId even if a legacy entry carries matchedRuleId", async () => {
    const { cardBId, ruleId, store, effectiveCashImpacts } = await seed();
    const legacyEntry: ExpenseEntry = {
      id: "legacy-1",
      amount: 340,
      category: "transport",
      source: "manual",
      paymentMethod: "credit",
      installments: 1,
      chargeDate: new Date(2026, 4, 12).toISOString(),
      createdAt: new Date(2026, 4, 12).toISOString(),
      accountId: cardBId,
      matchedRuleId: ruleId,
    };
    const accounts = store.getState().accounts;
    const rules = store.getState().rules as RecurringRule[];
    const impacts = effectiveCashImpacts({
      entry: legacyEntry,
      accounts,
      rules,
    });
    expect(impacts[0].viaCardId).toBe(cardBId);
  });
});
