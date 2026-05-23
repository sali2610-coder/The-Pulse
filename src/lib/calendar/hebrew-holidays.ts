// Hebrew + Israeli civil holiday lookup.
//
// Deliberately a small hand-curated table — no external API, no
// `hebcal` dependency. The dates here cover the years the app is
// realistically shipping into (2025-2030) and are sourced from the
// Hebcal almanac (https://www.hebcal.com/holidays). Each entry is a
// Gregorian ISO date so consumers don't have to deal with the Hebrew
// calendar.
//
// Use this as the foundation for holiday-aware insights ("spend dips
// the week of Yom Kippur", "Pesach grocery surge"). The table covers
// the major commerce-affecting holidays; secondary observances
// (Tu BiShvat, Lag BaOmer, etc.) are omitted on purpose so the noise
// stays low.
//
// To extend a year forward: copy the prior year's rows, shift the
// Gregorian dates by Hebcal lookup, add unit tests verifying at least
// one date per year.

export type HebrewHolidayId =
  | "rosh_hashana"
  | "yom_kippur"
  | "sukkot"
  | "simchat_torah"
  | "hanukkah"
  | "tu_bishvat"
  | "purim"
  | "passover"
  | "yom_haatzmaut"
  | "shavuot"
  | "tisha_bav";

export type HebrewHoliday = {
  id: HebrewHolidayId;
  /** Hebrew display name. */
  label: string;
  /** ISO date (UTC noon) marking the first day of the observance.
   *  Multi-day chag are represented by `durationDays`. */
  startISO: string;
  durationDays: number;
  /** A coarse signal for spending analysis. The dispatcher can hide
   *  holiday-week reminders or skew expectations by this. */
  spendImpact: "high" | "moderate" | "low";
};

// Sorted ascending by startISO. Keep that invariant — the lookup
// helpers assume it.
const HOLIDAYS: HebrewHoliday[] = [
  // 2025
  { id: "passover", label: "פסח", startISO: iso(2025, 4, 13), durationDays: 7, spendImpact: "high" },
  { id: "yom_haatzmaut", label: "יום העצמאות", startISO: iso(2025, 5, 1), durationDays: 1, spendImpact: "moderate" },
  { id: "shavuot", label: "שבועות", startISO: iso(2025, 6, 2), durationDays: 1, spendImpact: "moderate" },
  { id: "tisha_bav", label: "תשעה באב", startISO: iso(2025, 8, 3), durationDays: 1, spendImpact: "low" },
  { id: "rosh_hashana", label: "ראש השנה", startISO: iso(2025, 9, 23), durationDays: 2, spendImpact: "high" },
  { id: "yom_kippur", label: "יום כיפור", startISO: iso(2025, 10, 2), durationDays: 1, spendImpact: "low" },
  { id: "sukkot", label: "סוכות", startISO: iso(2025, 10, 7), durationDays: 7, spendImpact: "high" },
  { id: "simchat_torah", label: "שמחת תורה", startISO: iso(2025, 10, 14), durationDays: 1, spendImpact: "moderate" },
  { id: "hanukkah", label: "חנוכה", startISO: iso(2025, 12, 14), durationDays: 8, spendImpact: "high" },

  // 2026
  { id: "tu_bishvat", label: "טו בשבט", startISO: iso(2026, 2, 2), durationDays: 1, spendImpact: "low" },
  { id: "purim", label: "פורים", startISO: iso(2026, 3, 3), durationDays: 1, spendImpact: "high" },
  { id: "passover", label: "פסח", startISO: iso(2026, 4, 2), durationDays: 7, spendImpact: "high" },
  { id: "yom_haatzmaut", label: "יום העצמאות", startISO: iso(2026, 4, 22), durationDays: 1, spendImpact: "moderate" },
  { id: "shavuot", label: "שבועות", startISO: iso(2026, 5, 22), durationDays: 1, spendImpact: "moderate" },
  { id: "tisha_bav", label: "תשעה באב", startISO: iso(2026, 7, 23), durationDays: 1, spendImpact: "low" },
  { id: "rosh_hashana", label: "ראש השנה", startISO: iso(2026, 9, 12), durationDays: 2, spendImpact: "high" },
  { id: "yom_kippur", label: "יום כיפור", startISO: iso(2026, 9, 21), durationDays: 1, spendImpact: "low" },
  { id: "sukkot", label: "סוכות", startISO: iso(2026, 9, 26), durationDays: 7, spendImpact: "high" },
  { id: "simchat_torah", label: "שמחת תורה", startISO: iso(2026, 10, 3), durationDays: 1, spendImpact: "moderate" },
  { id: "hanukkah", label: "חנוכה", startISO: iso(2026, 12, 4), durationDays: 8, spendImpact: "high" },

  // 2027
  { id: "purim", label: "פורים", startISO: iso(2027, 3, 23), durationDays: 1, spendImpact: "high" },
  { id: "passover", label: "פסח", startISO: iso(2027, 4, 22), durationDays: 7, spendImpact: "high" },
  { id: "yom_haatzmaut", label: "יום העצמאות", startISO: iso(2027, 5, 12), durationDays: 1, spendImpact: "moderate" },
  { id: "shavuot", label: "שבועות", startISO: iso(2027, 6, 11), durationDays: 1, spendImpact: "moderate" },
  { id: "rosh_hashana", label: "ראש השנה", startISO: iso(2027, 10, 2), durationDays: 2, spendImpact: "high" },
  { id: "yom_kippur", label: "יום כיפור", startISO: iso(2027, 10, 11), durationDays: 1, spendImpact: "low" },
  { id: "sukkot", label: "סוכות", startISO: iso(2027, 10, 16), durationDays: 7, spendImpact: "high" },
  { id: "hanukkah", label: "חנוכה", startISO: iso(2027, 12, 25), durationDays: 8, spendImpact: "high" },
];

function iso(year: number, month: number, day: number): string {
  // Noon UTC keeps the date stable across Asia/Jerusalem (UTC+2/+3)
  // when consumers stringify by .toISOString().slice(0,10).
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).toISOString();
}

export function listHolidays(): HebrewHoliday[] {
  return HOLIDAYS.slice();
}

export function holidaysInRange(start: Date, end: Date): HebrewHoliday[] {
  if (end.getTime() < start.getTime()) return [];
  const out: HebrewHoliday[] = [];
  for (const h of HOLIDAYS) {
    const hs = new Date(h.startISO);
    const he = new Date(hs.getTime() + h.durationDays * 86_400_000);
    if (he < start) continue;
    if (hs > end) break;
    out.push(h);
  }
  return out;
}

/** True when `now` falls inside (or on) the holiday observance window. */
export function isHolidayToday(now: Date = new Date()): HebrewHoliday | null {
  for (const h of HOLIDAYS) {
    const hs = new Date(h.startISO);
    const he = new Date(hs.getTime() + h.durationDays * 86_400_000);
    if (now >= hs && now < he) return h;
  }
  return null;
}

export function nextHoliday(now: Date = new Date()): HebrewHoliday | null {
  for (const h of HOLIDAYS) {
    if (new Date(h.startISO) >= now) return h;
  }
  return null;
}
