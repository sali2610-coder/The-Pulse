// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import { buildDiagnosticReport } from "@/lib/diagnostic-export";
import {
  captureError,
  _resetErrorLogForTests,
} from "@/lib/error-log";
import {
  captureEvent,
  _resetAnalyticsForTests,
} from "@/lib/analytics";
import {
  captureSafetyBackup,
  clearSafetyBackups,
  writeCacheOwner,
} from "@/lib/local-safety-snapshots";
import { _resetNetWorthHistoryForTests } from "@/lib/net-worth-history";

beforeEach(() => {
  _resetErrorLogForTests();
  _resetAnalyticsForTests();
  clearSafetyBackups();
  _resetNetWorthHistoryForTests();
  writeCacheOwner(null);
});

describe("buildDiagnosticReport", () => {
  it("returns a fully shaped object on empty state", () => {
    const r = buildDiagnosticReport();
    expect(r.generatedAt).toBeGreaterThan(0);
    expect(r.counts).toEqual({
      errors: 0,
      analyticsEvents: 0,
      safetySnapshots: 0,
      netWorthSnapshots: 0,
    });
    expect(r.errors).toEqual([]);
    expect(r.events).toEqual([]);
    expect(r.cache.ownerHash).toBeNull();
  });

  it("shortens cache owner to 8 chars + ellipsis", () => {
    writeCacheOwner("abcdef1234567890");
    const r = buildDiagnosticReport();
    expect(r.cache.ownerHash).toBe("abcdef12…");
  });

  it("counts mirror the underlying logs", () => {
    captureError(new Error("x"), "manual");
    captureEvent("test");
    captureSafetyBackup("manual", {
      entries: [{ id: "e1" } as never],
      rules: [],
      statuses: [],
      accounts: [],
      loans: [],
      incomes: [],
      monthlyBudget: 0,
      lastSyncedAt: 0,
      audioEnabled: true,
    });
    const r = buildDiagnosticReport();
    expect(r.counts.errors).toBe(1);
    expect(r.counts.analyticsEvents).toBe(1);
    expect(r.counts.safetySnapshots).toBe(1);
  });

  it("caps embedded error array at 20", () => {
    for (let i = 0; i < 30; i++) captureError(`e${i}`, "manual");
    const r = buildDiagnosticReport();
    expect(r.errors).toHaveLength(20);
  });

  it("caps embedded events array at 50", () => {
    for (let i = 0; i < 100; i++) captureEvent(`evt${i}`);
    const r = buildDiagnosticReport();
    expect(r.events).toHaveLength(50);
  });

  it("includes browser fingerprint fields", () => {
    const r = buildDiagnosticReport();
    expect(typeof r.browser.userAgent).toBe("string");
    expect(typeof r.browser.online).toBe("boolean");
    expect(typeof r.browser.cookiesEnabled).toBe("boolean");
  });
});
