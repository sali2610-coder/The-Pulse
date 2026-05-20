// Phase 85 — store v7 migration. Existing recurring rules without a
// paymentSource field should be carried forward as `paymentSource:
// "unknown"` with EVERY OTHER FIELD UNCHANGED. Data safety mandate.

import { describe, expect, it } from "vitest";

// We can't directly invoke the persist middleware migrator from the
// store, but the migration body is a pure object transformation. Pull
// it out into a tiny inline reproduction for the test surface — this
// mirrors the v7 branch in src/lib/store.ts.

type LegacyRule = {
  id: string;
  label: string;
  category: string;
  estimatedAmount: number;
  dayOfMonth: number;
  keywords: string[];
  active: boolean;
  createdAt: string;
  installmentTotal?: number;
  startMonth?: number;
  startYear?: number;
};

function migrateRulesV7(rules: LegacyRule[]) {
  return rules.map((r) => {
    const rule = r as LegacyRule & {
      paymentSource?: "bank" | "card" | "cash" | "unknown";
    };
    if (rule.paymentSource !== undefined) return rule;
    return { ...rule, paymentSource: "unknown" as const };
  });
}

describe("Phase 85 v7 migration", () => {
  it("adds paymentSource=unknown to every rule that lacks it", () => {
    const v6Rules: LegacyRule[] = [
      {
        id: "r1",
        label: "ועד-בית",
        category: "bills",
        estimatedAmount: 350,
        dayOfMonth: 1,
        keywords: [],
        active: true,
        createdAt: "2026-05-01T00:00:00.000Z",
      },
      {
        id: "r2",
        label: "Netflix",
        category: "entertainment",
        estimatedAmount: 55,
        dayOfMonth: 10,
        keywords: [],
        active: true,
        createdAt: "2026-05-01T00:00:00.000Z",
        installmentTotal: undefined,
      },
    ];
    const v7 = migrateRulesV7(v6Rules);
    expect(v7).toHaveLength(2);
    expect(v7[0].paymentSource).toBe("unknown");
    expect(v7[1].paymentSource).toBe("unknown");
  });

  it("preserves every other field unchanged", () => {
    const r: LegacyRule = {
      id: "r1",
      label: "ארנונה",
      category: "bills",
      estimatedAmount: 600,
      dayOfMonth: 5,
      keywords: ["arnona"],
      active: false,
      createdAt: "2025-12-01T00:00:00.000Z",
      installmentTotal: 36,
      startMonth: 1,
      startYear: 2025,
    };
    const [migrated] = migrateRulesV7([r]);
    expect(migrated.id).toBe("r1");
    expect(migrated.label).toBe("ארנונה");
    expect(migrated.category).toBe("bills");
    expect(migrated.estimatedAmount).toBe(600);
    expect(migrated.dayOfMonth).toBe(5);
    expect(migrated.keywords).toEqual(["arnona"]);
    expect(migrated.active).toBe(false);
    expect(migrated.createdAt).toBe("2025-12-01T00:00:00.000Z");
    expect(migrated.installmentTotal).toBe(36);
    expect(migrated.startMonth).toBe(1);
    expect(migrated.startYear).toBe(2025);
  });

  it("does not overwrite an existing paymentSource value", () => {
    const r = {
      id: "r1",
      label: "x",
      category: "bills",
      estimatedAmount: 100,
      dayOfMonth: 1,
      keywords: [],
      active: true,
      createdAt: "2026-05-01T00:00:00.000Z",
      paymentSource: "card" as const,
    };
    const [migrated] = migrateRulesV7([r]);
    expect(migrated.paymentSource).toBe("card");
  });
});
