// Phase 267 — direct-push helper bypasses the debounced subscribe.
// Verifies the upsert payload uses the LATEST store state at the
// moment of the call, and single-flight collapses rapid taps.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const upsertCalls: Array<{
  monthlyBudget: number;
  budgetMode: "manual" | "auto";
  budgetSafetyBuffer: number;
}> = [];

vi.mock("@/lib/supabase/cloud-store", () => ({
  upsertUserSettings: vi.fn(async (args: {
    monthlyBudget: number;
    budgetMode: "manual" | "auto";
    budgetSafetyBuffer: number;
  }) => {
    upsertCalls.push({ ...args });
    return { ok: true as const };
  }),
}));

import { useFinanceStore } from "@/lib/store";
import { flushBudgetSettings } from "@/lib/budget-settings-flush";

beforeEach(() => {
  upsertCalls.length = 0;
  useFinanceStore.setState({
    entries: [],
    rules: [],
    statuses: [],
    accounts: [],
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

afterEach(() => {
  vi.clearAllMocks();
});

describe("flushBudgetSettings", () => {
  it("pushes the current store state to Supabase immediately", async () => {
    useFinanceStore.getState().setBudgetMode("auto");
    await flushBudgetSettings();
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].budgetMode).toBe("auto");
  });

  it("collapses concurrent calls into a single in-flight upsert", async () => {
    useFinanceStore.getState().setBudgetMode("auto");
    const a = flushBudgetSettings();
    const b = flushBudgetSettings();
    const c = flushBudgetSettings();
    const results = await Promise.all([a, b, c]);
    // Same promise returned → all three resolve to the same result.
    expect(results[0]).toEqual(results[1]);
    expect(results[1]).toEqual(results[2]);
    expect(upsertCalls).toHaveLength(1);
  });

  it("sends Manual + monthlyBudget=7000 verbatim", async () => {
    useFinanceStore.getState().setBudgetMode("manual");
    useFinanceStore.getState().setMonthlyBudget(7000);
    await flushBudgetSettings();
    expect(upsertCalls[0]).toMatchObject({
      monthlyBudget: 7000,
      budgetMode: "manual",
    });
  });

  it("sends Auto + monthlyBudget=0 — valid persisted state", async () => {
    useFinanceStore.getState().setBudgetMode("auto");
    useFinanceStore.getState().setMonthlyBudget(0);
    await flushBudgetSettings();
    expect(upsertCalls[0]).toMatchObject({
      monthlyBudget: 0,
      budgetMode: "auto",
    });
  });

  it("returns ok=false with the upstream reason when the push fails", async () => {
    const mod = await import("@/lib/supabase/cloud-store");
    (mod.upsertUserSettings as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      reason: "rls",
      detail: "permission denied",
    });
    const r = await flushBudgetSettings();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("rls");
      expect(r.detail).toBe("permission denied");
    }
  });
});
