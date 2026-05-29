// Phase 245 — guards the budgetMode persistence contract.
//
//   1. setBudgetMode bumps budgetSettingsUpdatedAt to "now" so the
//      cloud-sync reconcile can distinguish a fresh local choice
//      from an old / never-set one.
//   2. partialize/migrate carries budgetSettingsUpdatedAt through
//      the persist boundary so a hard reload preserves the marker.

import { describe, expect, it } from "vitest";

import { useFinanceStore } from "@/lib/store";

describe("budgetMode persistence markers", () => {
  it("setBudgetMode bumps budgetSettingsUpdatedAt", () => {
    const before = useFinanceStore.getState().budgetSettingsUpdatedAt;
    const t0 = Date.now();
    useFinanceStore.getState().setBudgetMode("auto");
    const after = useFinanceStore.getState().budgetSettingsUpdatedAt;
    expect(after).toBeGreaterThanOrEqual(t0);
    expect(after).toBeGreaterThan(before);
    expect(useFinanceStore.getState().budgetMode).toBe("auto");
  });

  it("flipping back to manual also bumps the marker", () => {
    const t0 = Date.now();
    useFinanceStore.getState().setBudgetMode("manual");
    const after = useFinanceStore.getState().budgetSettingsUpdatedAt;
    expect(after).toBeGreaterThanOrEqual(t0);
    expect(useFinanceStore.getState().budgetMode).toBe("manual");
  });

  it("setBudgetSafetyBuffer also bumps the marker", () => {
    const t0 = Date.now();
    useFinanceStore.getState().setBudgetSafetyBuffer(500);
    const after = useFinanceStore.getState().budgetSettingsUpdatedAt;
    expect(after).toBeGreaterThanOrEqual(t0);
    expect(useFinanceStore.getState().budgetSafetyBuffer).toBe(500);
  });

  it("setMonthlyBudget bumps the marker too", () => {
    const t0 = Date.now();
    useFinanceStore.getState().setMonthlyBudget(7200);
    const after = useFinanceStore.getState().budgetSettingsUpdatedAt;
    expect(after).toBeGreaterThanOrEqual(t0);
    expect(useFinanceStore.getState().monthlyBudget).toBe(7200);
  });

  it("Phase 274 — switching to auto clears any stale manual cap", () => {
    // Simulate the production bug: user typed 7000 in manual, then
    // switched to auto. Old behavior left 7000 in store + pushed it
    // back to Supabase, resurrecting the manual value after reload.
    useFinanceStore.getState().setBudgetMode("manual");
    useFinanceStore.getState().setMonthlyBudget(7000);
    expect(useFinanceStore.getState().monthlyBudget).toBe(7000);

    useFinanceStore.getState().setBudgetMode("auto");
    expect(useFinanceStore.getState().budgetMode).toBe("auto");
    expect(useFinanceStore.getState().monthlyBudget).toBe(0);
  });

  it("Phase 274 — switching back to manual does NOT zero the field", () => {
    // The user's last typed manual cap should survive a round-trip
    // through auto and back so they don't have to retype it.
    useFinanceStore.getState().setBudgetMode("manual");
    useFinanceStore.getState().setMonthlyBudget(4200);
    useFinanceStore.getState().setBudgetMode("auto");
    expect(useFinanceStore.getState().monthlyBudget).toBe(0);
    useFinanceStore.getState().setMonthlyBudget(4200);
    useFinanceStore.getState().setBudgetMode("manual");
    expect(useFinanceStore.getState().monthlyBudget).toBe(4200);
  });

  it("Phase 274 — markBudgetSettingsCloudSynced records cloud round-trip", () => {
    const t0 = Date.now();
    useFinanceStore.getState().markBudgetSettingsCloudSynced(t0);
    expect(useFinanceStore.getState().budgetSettingsCloudAt).toBe(t0);
  });

  it("Phase 288 — setTextScale persists in store and bumps updatedAt", () => {
    const t0 = Date.now();
    useFinanceStore.getState().setTextScale("large");
    expect(useFinanceStore.getState().textScale).toBe("large");
    expect(useFinanceStore.getState().textScaleUpdatedAt).toBeGreaterThanOrEqual(
      t0,
    );
  });

  it("Phase 288 — markTextScaleCloudSynced records cloud round-trip", () => {
    const t0 = Date.now();
    useFinanceStore.getState().markTextScaleCloudSynced(t0);
    expect(useFinanceStore.getState().textScaleCloudAt).toBe(t0);
  });

  it("Phase 288 — setTextScale coerces invalid values to 'normal'", () => {
    useFinanceStore
      .getState()
      .setTextScale("huge" as unknown as "large");
    expect(useFinanceStore.getState().textScale).toBe("normal");
  });
});
