// Deterministic policy tests for the cloud-hydration reconcile rule.
// Mirrors the branch logic in use-cloud-sync.ts without React/Supabase
// so the rule itself is verifiable.

import { describe, expect, it } from "vitest";

import { richness } from "@/lib/local-safety-snapshots";

type Counts = {
  entries: number;
  rules: number;
  accounts: number;
  loans: number;
  incomes: number;
  monthlyBudget: number;
};

type Action = "apply-cloud" | "push-local" | "noop";

// Pure mirror of the reconcile branch in useCloudSync.
// monthlyBudget is excluded from both sides — that field is KV-only,
// not synced to Supabase tables.
function reconcile(local: Counts, cloud: Omit<Counts, "monthlyBudget">): Action {
  const localR = richness({ ...local, monthlyBudget: 0 });
  const cloudR = richness({ ...cloud, monthlyBudget: 0 });
  if (cloudR > localR) return "apply-cloud";
  if (cloudR < localR) return "push-local";
  return "noop";
}

const EMPTY: Counts = {
  entries: 0,
  rules: 0,
  accounts: 0,
  loans: 0,
  incomes: 0,
  monthlyBudget: 0,
};
const RICH_LOCAL: Counts = {
  entries: 30,
  rules: 5,
  accounts: 2,
  loans: 1,
  incomes: 1,
  monthlyBudget: 6000,
};

describe("cloud hydration reconcile", () => {
  it("empty cloud + rich local → push-local (never wipe)", () => {
    expect(
      reconcile(RICH_LOCAL, {
        entries: 0,
        rules: 0,
        accounts: 0,
        loans: 0,
        incomes: 0,
      }),
    ).toBe("push-local");
  });

  it("rich cloud + empty local → apply-cloud (first device)", () => {
    expect(
      reconcile(EMPTY, {
        entries: 30,
        rules: 5,
        accounts: 2,
        loans: 1,
        incomes: 1,
      }),
    ).toBe("apply-cloud");
  });

  it("equal richness → noop (already in sync)", () => {
    expect(
      reconcile(RICH_LOCAL, {
        entries: 30,
        rules: 5,
        accounts: 2,
        loans: 1,
        incomes: 1,
      }),
    ).toBe("noop");
  });

  it("empty + empty → noop", () => {
    expect(
      reconcile(EMPTY, {
        entries: 0,
        rules: 0,
        accounts: 0,
        loans: 0,
        incomes: 0,
      }),
    ).toBe("noop");
  });

  it("cloud strictly larger → apply-cloud", () => {
    expect(
      reconcile(RICH_LOCAL, {
        entries: 60,
        rules: 5,
        accounts: 2,
        loans: 1,
        incomes: 1,
      }),
    ).toBe("apply-cloud");
  });

  it("local strictly larger → push-local", () => {
    expect(
      reconcile(RICH_LOCAL, {
        entries: 5,
        rules: 0,
        accounts: 1,
        loans: 0,
        incomes: 0,
      }),
    ).toBe("push-local");
  });
});
