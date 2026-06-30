// Phase 429 — Home formatters. Pure helpers; no React, no store.
//
// One canonical money string for ledger rows / odometer. Always
// returns "₪ N,NNN" with optional sign for deltas.

const ILS_NUM = new Intl.NumberFormat("he-IL", {
  maximumFractionDigits: 0,
});

const HEB_DATE = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "numeric",
});

export function money(n: number, opts?: { sign?: boolean }): string {
  const rounded = Math.round(n);
  const abs = Math.abs(rounded);
  const formatted = `₪${ILS_NUM.format(abs)}`;
  if (!opts?.sign) return formatted;
  if (rounded > 0) return `+${formatted}`;
  if (rounded < 0) return `−${formatted}`;
  return formatted;
}

export function shortDate(d: Date): string {
  return HEB_DATE.format(d);
}

export function daysUntil(target: Date, now: Date = new Date()): number {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
  );
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function relativeDay(d: Date, now: Date = new Date()): string {
  const delta = daysUntil(d, now);
  if (delta === 0) return "היום";
  if (delta === 1) return "מחר";
  if (delta === -1) return "אתמול";
  if (delta > 1 && delta <= 6) return `בעוד ${delta} ימים`;
  if (delta < -1 && delta >= -6) return `לפני ${Math.abs(delta)} ימים`;
  return shortDate(d);
}
