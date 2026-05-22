// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  recordSnapshot,
  listSnapshots,
  clearSnapshots,
  _resetNetWorthHistoryForTests,
} from "@/lib/net-worth-history";

beforeEach(() => {
  _resetNetWorthHistoryForTests();
});

describe("recordSnapshot / listSnapshots", () => {
  it("returns empty on a fresh store", () => {
    expect(listSnapshots()).toEqual([]);
  });

  it("persists a single snapshot under its monthKey", () => {
    recordSnapshot({ netWorth: 12000, monthKey: "2026-05" });
    const list = listSnapshots();
    expect(list).toHaveLength(1);
    expect(list[0].monthKey).toBe("2026-05");
    expect(list[0].netWorth).toBe(12000);
  });

  it("replaces same-month snapshot (idempotent per month)", () => {
    recordSnapshot({ netWorth: 12000, monthKey: "2026-05" });
    recordSnapshot({ netWorth: 13500, monthKey: "2026-05" });
    const list = listSnapshots();
    expect(list).toHaveLength(1);
    expect(list[0].netWorth).toBe(13500);
  });

  it("returns ascending-by-month ordering", () => {
    recordSnapshot({ netWorth: 1, monthKey: "2026-05" });
    recordSnapshot({ netWorth: 2, monthKey: "2026-03" });
    recordSnapshot({ netWorth: 3, monthKey: "2026-04" });
    const months = listSnapshots().map((s) => s.monthKey);
    expect(months).toEqual(["2026-03", "2026-04", "2026-05"]);
  });

  it("FIFO trim at 24 entries — keeps newest months", () => {
    // Insert 30 months chronologically.
    for (let i = 0; i < 30; i++) {
      const y = 2024 + Math.floor(i / 12);
      const m = (i % 12) + 1;
      const key = `${y}-${String(m).padStart(2, "0")}`;
      recordSnapshot({ netWorth: i, monthKey: key });
    }
    const list = listSnapshots();
    expect(list).toHaveLength(24);
    // First 6 (Jan 2024 → Jun 2024) should have been evicted.
    const months = new Set(list.map((s) => s.monthKey));
    expect(months.has("2024-01")).toBe(false);
    expect(months.has("2024-06")).toBe(false);
    expect(months.has("2024-07")).toBe(true);
    expect(months.has("2026-06")).toBe(true);
  });

  it("clearSnapshots wipes the log", () => {
    recordSnapshot({ netWorth: 1, monthKey: "2026-05" });
    clearSnapshots();
    expect(listSnapshots()).toEqual([]);
  });

  it("captures monthKey from `now` when not given", () => {
    recordSnapshot({
      netWorth: 9999,
      now: new Date(2026, 4, 15, 12, 0, 0),
    });
    expect(listSnapshots()[0].monthKey).toBe("2026-05");
  });

  it("stores capturedAt timestamp", () => {
    const before = Date.now();
    recordSnapshot({ netWorth: 100, monthKey: "2026-05" });
    const after = Date.now();
    const s = listSnapshots()[0];
    expect(s.capturedAt).toBeGreaterThanOrEqual(before);
    expect(s.capturedAt).toBeLessThanOrEqual(after);
  });
});
