// Phase 264 — view-layer grouping of card obligations by effective
// charge month. Pure render math; engine totals unchanged.

import { describe, expect, it } from "vitest";

import {
  groupItemsByMonth,
  hebrewMonthFromKey,
} from "@/lib/card-month-grouping";

function row(monthISO: string, amount: number) {
  return { effectiveCashAt: `${monthISO}T12:00:00.000Z`, amount };
}

const NOW = new Date(2026, 5, 4, 12, 0, 0); // 2026-06-04

describe("groupItemsByMonth", () => {
  it("groups by month and sums each subtotal", () => {
    const groups = groupItemsByMonth(
      [
        row("2026-06-10", 300),
        row("2026-06-25", 200),
        row("2026-07-10", 100),
      ],
      NOW,
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].subtotal).toBe(500);
    expect(groups[1].subtotal).toBe(100);
  });

  it("labels current month, next month, and future month distinctly", () => {
    const groups = groupItemsByMonth(
      [
        row("2026-06-10", 1),
        row("2026-07-10", 1),
        row("2026-08-10", 1),
      ],
      NOW,
    );
    expect(groups[0].kind).toBe("current");
    expect(groups[0].label.startsWith("חיובים קרובים")).toBe(true);
    expect(groups[0].label).toContain("יוני");

    expect(groups[1].kind).toBe("next");
    expect(groups[1].label.startsWith("החודש הבא")).toBe(true);
    expect(groups[1].label).toContain("יולי");

    expect(groups[2].kind).toBe("future");
    expect(groups[2].label.startsWith("תשלומים עתידיים")).toBe(true);
    expect(groups[2].label).toContain("אוגוסט");
  });

  it("sorts groups chronologically", () => {
    const groups = groupItemsByMonth(
      [row("2026-08-10", 1), row("2026-06-10", 1), row("2026-07-10", 1)],
      NOW,
    );
    expect(groups.map((g) => g.monthKey)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
  });

  it("hebrewMonthFromKey returns the Hebrew month name", () => {
    expect(hebrewMonthFromKey("2026-01")).toBe("ינואר");
    expect(hebrewMonthFromKey("2026-06")).toBe("יוני");
    expect(hebrewMonthFromKey("2026-12")).toBe("דצמבר");
  });

  it("returns empty array for empty input", () => {
    expect(groupItemsByMonth([], NOW)).toEqual([]);
  });

  it("merges multiple rows in the same month into one group", () => {
    const groups = groupItemsByMonth(
      [
        row("2026-06-10", 100),
        row("2026-06-14", 200),
        row("2026-06-20", 50),
      ],
      NOW,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(3);
    expect(groups[0].subtotal).toBe(350);
  });
});
