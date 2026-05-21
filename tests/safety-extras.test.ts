// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  captureSafetyBackup,
  clearSafetyBackups,
  consumeForceApplyNext,
  listRecoverableSnapshots,
  readLastRestoreResult,
  recordRestoreResult,
  setForceApplyNext,
  summarizePayload,
  verifyRestore,
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
  window.localStorage.removeItem("sally.safety.forceApplyNextGet");
  window.localStorage.removeItem("sally.safety.lastRestore");
});

describe("forceApplyNext flag", () => {
  it("round-trips through localStorage", () => {
    setForceApplyNext("cloud-restore");
    const out = consumeForceApplyNext();
    expect(out?.reason).toBe("cloud-restore");
  });

  it("is single-use — second consume returns null", () => {
    setForceApplyNext("cloud-restore");
    consumeForceApplyNext();
    expect(consumeForceApplyNext()).toBeNull();
  });
});

describe("recordRestoreResult / readLastRestoreResult", () => {
  it("persists the last restore result for the diagnostic surface", () => {
    recordRestoreResult({
      at: 100,
      source: "local-safety",
      ok: true,
      beforeRichness: 5,
      expectedRichness: 30,
      afterRichness: 30,
    });
    const r = readLastRestoreResult();
    expect(r?.ok).toBe(true);
    expect(r?.afterRichness).toBe(30);
  });
});

describe("verifyRestore", () => {
  it("ok when counts match", () => {
    const p = payload({
      entries: [{ id: "e1" } as never],
      accounts: [{ id: "a1" } as never],
      monthlyBudget: 5000,
    });
    const counts = summarizePayload(p);
    expect(verifyRestore({ expected: counts, actual: counts }).ok).toBe(true);
  });

  it("fails when entry count differs", () => {
    const expected = summarizePayload(
      payload({ entries: [{ id: "e1" } as never] }),
    );
    const actual = summarizePayload(payload());
    const v = verifyRestore({ expected, actual });
    expect(v.ok).toBe(false);
    expect(v.mismatch).toContain("entries");
  });

  it("fails when monthlyBudget differs", () => {
    const expected = summarizePayload(payload({ monthlyBudget: 4000 }));
    const actual = summarizePayload(payload({ monthlyBudget: 0 }));
    const v = verifyRestore({ expected, actual });
    expect(v.ok).toBe(false);
    expect(v.mismatch).toContain("monthlyBudget");
  });
});

describe("listRecoverableSnapshots", () => {
  it("returns snapshots sorted by richness DESC then capturedAt DESC", async () => {
    captureSafetyBackup(
      "auto-tick",
      payload({ entries: [{ id: "e1" } as never] }),
    );
    await new Promise((r) => setTimeout(r, 2));
    captureSafetyBackup(
      "pre-restore",
      payload({
        entries: Array.from({ length: 30 }, (_, i) => ({ id: `e${i}` } as never)),
      }),
    );
    await new Promise((r) => setTimeout(r, 2));
    captureSafetyBackup(
      "manual",
      payload({ entries: [{ id: "x" } as never] }),
    );
    const list = listRecoverableSnapshots();
    expect(list[0].counts.entries).toBe(30);
  });

  it("returns the empty list when nothing is captured", () => {
    expect(listRecoverableSnapshots()).toEqual([]);
  });
});
