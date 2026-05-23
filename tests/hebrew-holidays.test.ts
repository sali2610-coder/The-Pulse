import { describe, expect, it } from "vitest";

import {
  holidaysInRange,
  isHolidayToday,
  listHolidays,
  nextHoliday,
} from "@/lib/calendar";

describe("hebrew holiday table", () => {
  it("contains at least one row per year 2025-2027", () => {
    const all = listHolidays();
    for (const year of [2025, 2026, 2027]) {
      const yearRows = all.filter((h) => h.startISO.startsWith(`${year}-`));
      expect(yearRows.length).toBeGreaterThan(0);
    }
  });

  it("is sorted ascending by startISO", () => {
    const all = listHolidays();
    for (let i = 1; i < all.length; i++) {
      expect(all[i].startISO >= all[i - 1].startISO).toBe(true);
    }
  });

  it("isHolidayToday hits the inside of a multi-day chag", () => {
    // Passover 2026 starts 2026-04-02, runs 7 days → midpoint inside.
    const mid = new Date("2026-04-05T10:00:00.000Z");
    const h = isHolidayToday(mid);
    expect(h?.id).toBe("passover");
  });

  it("isHolidayToday returns null between holidays", () => {
    // 2026-08-01 sits between Tisha B'Av (2026-07-23) and Rosh Hashana (2026-09-12).
    expect(isHolidayToday(new Date("2026-08-01T10:00:00.000Z"))).toBeNull();
  });

  it("nextHoliday returns the chronologically-next entry", () => {
    const after = new Date("2026-05-01T00:00:00.000Z");
    const n = nextHoliday(after);
    expect(n).not.toBeNull();
    expect(new Date(n!.startISO).getTime()).toBeGreaterThan(after.getTime());
  });

  it("holidaysInRange returns only entries that overlap the window", () => {
    const start = new Date("2026-09-01T00:00:00.000Z");
    const end = new Date("2026-10-31T23:59:59.000Z");
    const r = holidaysInRange(start, end);
    const ids = r.map((h) => h.id);
    expect(ids).toContain("rosh_hashana");
    expect(ids).toContain("yom_kippur");
    expect(ids).toContain("sukkot");
    // Hanukkah (Dec) must NOT appear.
    expect(ids).not.toContain("hanukkah");
  });

  it("holidaysInRange handles inverted ranges gracefully", () => {
    const end = new Date("2026-01-01T00:00:00.000Z");
    const start = new Date("2026-12-01T00:00:00.000Z");
    expect(holidaysInRange(start, end)).toEqual([]);
  });
});
