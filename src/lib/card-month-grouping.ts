// Phase 264 — visual grouping helper for card-hierarchy item lists.
//
// Pure compute. Splits an array of items (already sorted by
// effectiveCashAt ASC) into month-buckets so the UI can render a
// labeled header + subtotal per month. Labels follow the
// emotional-clarity brief:
//
//   חיובים קרובים — <current month>
//   החודש הבא — <next month>
//   תשלומים עתידיים — <further month>
//
// No engine change. View layer only.

export type MonthGroupLabelKind = "current" | "next" | "future";

export type MonthGroup<T extends { effectiveCashAt: string }> = {
  /** YYYY-MM key for stable React keying. */
  monthKey: string;
  /** "חיובים קרובים — יוני" / "החודש הבא — יולי" / "תשלומים עתידיים — אוגוסט" */
  label: string;
  /** Just the month name in Hebrew, for per-row "חיוב <month>". */
  monthName: string;
  /** Group tier — lets the UI pick a calmer accent for future
   *  months so the current month dominates visually. */
  kind: MonthGroupLabelKind;
  /** Sum of `it.amount` across this group. UI uses for subtotal. */
  subtotal: number;
  /** Rows that fall into this month. */
  items: T[];
};

const HEBREW_MONTHS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

export function hebrewMonthFromKey(monthKey: string): string {
  const m = Number(monthKey.split("-")[1]);
  if (!Number.isFinite(m) || m < 1 || m > 12) return monthKey;
  return HEBREW_MONTHS[m - 1];
}

function monthKeyOfISO(iso: string): string {
  return iso.slice(0, 7);
}

function compareMonthKey(a: string, b: string): number {
  return a.localeCompare(b);
}

export function groupItemsByMonth<
  T extends { effectiveCashAt: string; amount: number },
>(items: T[], now: Date = new Date()): MonthGroup<T>[] {
  const currentMonthKey = `${now.getFullYear()}-${String(
    now.getMonth() + 1,
  ).padStart(2, "0")}`;
  const nextDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthKey = `${nextDate.getFullYear()}-${String(
    nextDate.getMonth() + 1,
  ).padStart(2, "0")}`;

  const buckets = new Map<string, T[]>();
  for (const it of items) {
    const key = monthKeyOfISO(it.effectiveCashAt);
    const arr = buckets.get(key) ?? [];
    arr.push(it);
    buckets.set(key, arr);
  }

  const groups: MonthGroup<T>[] = [];
  for (const [key, rows] of buckets.entries()) {
    const monthName = hebrewMonthFromKey(key);
    let kind: MonthGroupLabelKind;
    let label: string;
    if (key === currentMonthKey) {
      kind = "current";
      label = `חיובים קרובים — ${monthName}`;
    } else if (key === nextMonthKey) {
      kind = "next";
      label = `החודש הבא — ${monthName}`;
    } else {
      kind = "future";
      label = `תשלומים עתידיים — ${monthName}`;
    }
    const subtotal = rows.reduce((acc, r) => acc + r.amount, 0);
    groups.push({ monthKey: key, label, monthName, kind, subtotal, items: rows });
  }
  groups.sort((a, b) => compareMonthKey(a.monthKey, b.monthKey));
  return groups;
}
