// Phase 263 — reinstall persistence audit.
//
// Locks the 6 acceptance scenarios from the brief plus the bug
// scenario that originally broke it (reinstall with cloud NULL +
// local default → must NOT push manual back up).

import { describe, expect, it } from "vitest";

import {
  reconcileBudgetSettings,
  type LocalSettings,
  type CloudSettings,
  LOCAL_RECENT_MS,
} from "@/lib/supabase/budget-settings-reconcile";

function local(overrides: Partial<LocalSettings> = {}): LocalSettings {
  return {
    monthlyBudget: 0,
    budgetMode: "manual",
    budgetSafetyBuffer: 0,
    budgetSettingsUpdatedAt: 0,
    ...overrides,
  };
}

function cloud(overrides: Partial<CloudSettings> = {}): CloudSettings {
  return {
    monthlyBudget: 0,
    budgetMode: undefined,
    budgetSafetyBuffer: undefined,
    ...overrides,
  };
}

const NOW = 1_750_000_000_000;

describe("reinstall — local default + cloud NULL must NOT push", () => {
  it("does NOT push manual default to cloud", () => {
    const d = reconcileBudgetSettings({
      local: local(),
      cloud: cloud(),
      now: NOW,
    });
    expect(d.pushCloud).toBeNull();
    expect(d.applyLocal).toEqual({});
  });

  it("does NOT push manualBudget=0 default to cloud", () => {
    const d = reconcileBudgetSettings({
      local: local({ monthlyBudget: 0 }),
      cloud: cloud(),
      now: NOW,
    });
    expect(d.pushCloud).toBeNull();
  });
});

describe("reinstall — cloud has previously-saved auto, local default", () => {
  it("applies cloud auto over local manual default", () => {
    const d = reconcileBudgetSettings({
      local: local({ budgetMode: "manual" }),
      cloud: cloud({ budgetMode: "auto" }),
      now: NOW,
    });
    expect(d.applyLocal.budgetMode).toBe("auto");
    expect(d.pushCloud).toBeNull();
  });

  it("bumps local timestamp so future reconciles know this came from cloud, not user", () => {
    const d = reconcileBudgetSettings({
      local: local({ budgetMode: "manual" }),
      cloud: cloud({ budgetMode: "auto" }),
      now: NOW,
    });
    expect(d.applyLocal.budgetSettingsUpdatedAt).toBe(NOW);
  });
});

describe("set auto + close fast — local recent must win", () => {
  it("pushes local auto to cloud when local was just touched", () => {
    const d = reconcileBudgetSettings({
      local: local({
        budgetMode: "auto",
        budgetSettingsUpdatedAt: NOW - 30_000, // 30s ago
      }),
      cloud: cloud({ budgetMode: "manual" }), // stale cloud
      now: NOW,
    });
    expect(d.pushCloud?.budgetMode).toBe("auto");
    expect(d.applyLocal.budgetMode).toBeUndefined();
  });

  it("respects the LOCAL_RECENT_MS window edge", () => {
    const localTs = NOW - LOCAL_RECENT_MS - 1;
    const d = reconcileBudgetSettings({
      local: local({
        budgetMode: "auto",
        budgetSettingsUpdatedAt: localTs,
        // Phase 274 — the push DID complete, so there is no pending
        // push to defend. Cloud is authoritative outside the recency
        // window.
        budgetSettingsCloudAt: localTs,
      }),
      cloud: cloud({ budgetMode: "manual" }),
      now: NOW,
    });
    // Outside the window — cloud wins.
    expect(d.applyLocal.budgetMode).toBe("manual");
    expect(d.pushCloud).toBeNull();
  });
});

describe("monthlyBudget = 0 in auto mode", () => {
  it("does NOT reset mode just because monthlyBudget is 0", () => {
    const d = reconcileBudgetSettings({
      local: local({
        monthlyBudget: 0,
        budgetMode: "auto",
        budgetSettingsUpdatedAt: NOW - 10_000,
      }),
      cloud: cloud({
        monthlyBudget: 0,
        budgetMode: "auto",
      }),
      now: NOW,
    });
    // Already aligned — no apply, no push.
    expect(d.applyLocal).toEqual({});
    expect(d.pushCloud).toBeNull();
  });
});

describe("safety buffer round-trip", () => {
  it("applies cloud buffer over local default", () => {
    const d = reconcileBudgetSettings({
      local: local({ budgetSafetyBuffer: 0 }),
      cloud: cloud({ budgetSafetyBuffer: 750 }),
      now: NOW,
    });
    expect(d.applyLocal.budgetSafetyBuffer).toBe(750);
  });

  it("pushes local buffer when local is recent + value diverged", () => {
    const d = reconcileBudgetSettings({
      local: local({
        budgetSafetyBuffer: 1000,
        budgetSettingsUpdatedAt: NOW - 1_000,
      }),
      cloud: cloud({ budgetSafetyBuffer: 0 }),
      now: NOW,
    });
    expect(d.pushCloud?.budgetSafetyBuffer).toBe(1000);
  });
});

describe("acceptance — 6 scenarios from the brief", () => {
  it("1. set auto → reload → still auto (local opinionated)", () => {
    // After reload local is the persisted value (auto), cloud agrees.
    const d = reconcileBudgetSettings({
      local: local({
        budgetMode: "auto",
        budgetSettingsUpdatedAt: NOW - 24 * 60 * 60 * 1000,
      }),
      cloud: cloud({ budgetMode: "auto" }),
      now: NOW,
    });
    expect(d.applyLocal.budgetMode).toBeUndefined();
    expect(d.pushCloud).toBeNull();
  });

  it("2. set auto → close/open PWA → still auto (cloud has auto)", () => {
    const d = reconcileBudgetSettings({
      local: local({
        budgetMode: "auto",
        budgetSettingsUpdatedAt: NOW - 60_000,
      }),
      cloud: cloud({ budgetMode: "auto" }),
      now: NOW,
    });
    expect(d.applyLocal).toEqual({});
    expect(d.pushCloud).toBeNull();
  });

  it("3. set auto → reinstall → still auto (cloud restores)", () => {
    const d = reconcileBudgetSettings({
      local: local({ budgetMode: "manual" }), // default after reinstall
      cloud: cloud({ budgetMode: "auto" }),
      now: NOW,
    });
    expect(d.applyLocal.budgetMode).toBe("auto");
  });

  it("4. set manual → reinstall → still manual", () => {
    const d = reconcileBudgetSettings({
      local: local({ budgetMode: "manual" }),
      cloud: cloud({ budgetMode: "manual" }),
      now: NOW,
    });
    expect(d.applyLocal.budgetMode).toBeUndefined();
    expect(d.pushCloud).toBeNull();
  });

  it("5. set safety buffer → reinstall → restored from cloud", () => {
    const d = reconcileBudgetSettings({
      local: local({ budgetSafetyBuffer: 0 }),
      cloud: cloud({
        budgetMode: "auto",
        budgetSafetyBuffer: 1200,
      }),
      now: NOW,
    });
    expect(d.applyLocal.budgetMode).toBe("auto");
    expect(d.applyLocal.budgetSafetyBuffer).toBe(1200);
  });

  it("6. monthlyBudget=0 in auto mode does not reset mode", () => {
    const d = reconcileBudgetSettings({
      local: local({
        monthlyBudget: 0,
        budgetMode: "auto",
        budgetSettingsUpdatedAt: NOW - 1_000,
      }),
      cloud: cloud({ monthlyBudget: 0, budgetMode: "auto" }),
      now: NOW,
    });
    expect(d.applyLocal.budgetMode).toBeUndefined();
    expect(d.pushCloud).toBeNull();
  });
});

describe("ownershipMismatch — never push local under another user's id", () => {
  it("suppresses push even when local is opinionated", () => {
    const d = reconcileBudgetSettings({
      local: local({
        budgetMode: "auto",
        budgetSettingsUpdatedAt: NOW - 1_000,
      }),
      cloud: cloud(),
      now: NOW,
      ownershipMismatch: true,
    });
    expect(d.pushCloud).toBeNull();
  });
});

describe("Phase 274 — pending push beats stale cloud regardless of age", () => {
  it("local 'auto' beats cloud 'manual' when push never landed, even past recency", () => {
    // User switched to auto an hour ago but Supabase rejected the
    // upsert (RLS). budgetSettingsCloudAt is still 0 (never confirmed).
    // Cloud still says manual. Without the pending-push gate, the old
    // logic would have reverted local back to manual after 5 minutes.
    const d = reconcileBudgetSettings({
      local: local({
        budgetMode: "auto",
        budgetSettingsUpdatedAt: NOW - 60 * 60 * 1000,
        budgetSettingsCloudAt: 0,
      }),
      cloud: cloud({ monthlyBudget: 7000, budgetMode: "manual" }),
      now: NOW,
    });
    expect(d.applyLocal.budgetMode).toBeUndefined();
    expect(d.pushCloud?.budgetMode).toBe("auto");
  });

  it("once cloud has caught up, cloud is authoritative again", () => {
    // Same setup but the push DID succeed: budgetSettingsCloudAt ==
    // budgetSettingsUpdatedAt. A subsequent reconcile that pulls
    // back the truly latest cloud value should now apply it.
    const ts = NOW - 60 * 60 * 1000;
    const d = reconcileBudgetSettings({
      local: local({
        budgetMode: "auto",
        budgetSettingsUpdatedAt: ts,
        budgetSettingsCloudAt: ts,
      }),
      cloud: cloud({ monthlyBudget: 0, budgetMode: "manual" }),
      now: NOW,
    });
    expect(d.applyLocal.budgetMode).toBe("manual");
  });
});
