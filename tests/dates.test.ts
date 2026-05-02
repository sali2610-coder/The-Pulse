import { describe, expect, it } from "vitest";
import {
  monthKeyOf,
  monthIndex,
  addMonths,
  isSameMonth,
  dayWithinMonth,
} from "@/lib/dates";

describe("dates", () => {
  it("monthKeyOf pads single-digit months", () => {
    expect(monthKeyOf(new Date(2026, 0, 15))).toBe("2026-01");
    expect(monthKeyOf(new Date(2026, 11, 1))).toBe("2026-12");
  });

  it("monthIndex is monotonic across years", () => {
    expect(monthIndex("2026-12") + 1).toBe(monthIndex("2027-01"));
  });

  it("addMonths handles year crossings in both directions", () => {
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(addMonths("2026-02", -3)).toBe("2025-11");
  });

  it("isSameMonth", () => {
    expect(
      isSameMonth(new Date(2026, 4, 1), new Date(2026, 4, 28)),
    ).toBe(true);
    expect(
      isSameMonth(new Date(2026, 4, 30), new Date(2026, 5, 1)),
    ).toBe(false);
  });

  it("dayWithinMonth clamps to last day", () => {
    // Feb 2026 has 28 days; asking for day 31 must clamp to 28.
    const d = dayWithinMonth("2026-02", 31);
    expect(d.getDate()).toBe(28);
    expect(d.getMonth()).toBe(1);
    expect(d.getFullYear()).toBe(2026);
  });
});
