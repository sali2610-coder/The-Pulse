import type { MonthKey } from "@/types/finance";

export function monthKeyOf(date: Date): MonthKey {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function currentMonthKey(now: Date = new Date()): MonthKey {
  return monthKeyOf(now);
}

export function monthIndex(key: MonthKey): number {
  const [y, m] = key.split("-").map(Number);
  return y * 12 + (m - 1);
}

export function addMonths(key: MonthKey, delta: number): MonthKey {
  const idx = monthIndex(key) + delta;
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function isSameMonth(a: Date, b: Date): boolean {
  return monthKeyOf(a) === monthKeyOf(b);
}

export function dayWithinMonth(monthKey: MonthKey, day: number): Date {
  const [y, m] = monthKey.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return new Date(y, m - 1, Math.min(day, last));
}
