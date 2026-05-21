// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  captureSafetyBackup,
  clearSafetyBackups,
  findRichestSafetyBackup,
  listSafetyBackups,
  richness,
  summarizePayload,
  type SafetyPayload,
} from "@/lib/local-safety-snapshots";

function payload(overrides: Partial<SafetyPayload> = {}): SafetyPayload {
  return {
    entries: [],
    rules: [],
    statuses: [],
    accounts: [],
    loans: [],
    incomes: [],
    monthlyBudget: 0,
    lastSyncedAt: 0,
    audioEnabled: true,
    ...overrides,
  };
}

beforeEach(() => {
  clearSafetyBackups();
});

describe("local-safety-snapshots", () => {
  it("captures + lists a rich snapshot", () => {
    const p = payload({
      entries: [{ id: "e1" } as never],
      accounts: [{ id: "a1" } as never],
      monthlyBudget: 5000,
    });
    captureSafetyBackup("manual", p);
    const list = listSafetyBackups();
    expect(list).toHaveLength(1);
    expect(list[0].counts.richness).toBeGreaterThan(0);
  });

  it("skips empty payloads — no waste of slots", () => {
    captureSafetyBackup("auto-tick", payload());
    expect(listSafetyBackups()).toHaveLength(0);
  });

  it("findRichestSafetyBackup prefers the richer entry", () => {
    captureSafetyBackup(
      "manual",
      payload({ entries: [{ id: "x" } as never] }),
    );
    captureSafetyBackup(
      "manual",
      payload({
        entries: Array.from({ length: 30 }, (_, i) => ({ id: `e${i}` } as never)),
      }),
    );
    captureSafetyBackup(
      "manual",
      payload({ entries: [{ id: "y" } as never] }),
    );
    const best = findRichestSafetyBackup();
    expect(best?.counts.entries).toBe(30);
  });

  it("survives multiple captures via FIFO trim at 20", () => {
    for (let i = 0; i < 25; i++) {
      captureSafetyBackup(
        "auto-tick",
        payload({ entries: [{ id: `e${i}` } as never] }),
      );
    }
    expect(listSafetyBackups()).toHaveLength(20);
  });

  it("summarizePayload computes correct counts", () => {
    const p = payload({
      entries: [{ id: "e1" } as never, { id: "e2" } as never],
      accounts: [{ id: "a1" } as never],
      monthlyBudget: 4000,
    });
    const c = summarizePayload(p);
    expect(c.entries).toBe(2);
    expect(c.accounts).toBe(1);
    expect(c.richness).toBe(richness(c));
  });
});
