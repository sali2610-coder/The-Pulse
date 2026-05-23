// Calendar utility surface.
//
// Foundation for holiday-aware features. Today exposes a hand-curated
// Hebrew + Israeli civil holiday table — see `hebrew-holidays.ts` for
// the maintenance rule. No external API, no `hebcal` dependency.

export {
  holidaysInRange,
  isHolidayToday,
  listHolidays,
  nextHoliday,
  type HebrewHoliday,
  type HebrewHolidayId,
} from "./hebrew-holidays";
