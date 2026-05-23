// Daily cashflow grouping.
//
// Walks the entries log, buckets each charge slice by local-day, and
// emits a per-day summary the timeline UI uses:
//
//   - dayKey        — YYYY-MM-DD (local), stable id for the row
//   - timestamp     — ms at local 12:00 noon for the day (sort key)
//   - label         — "היום" | "אתמול" | weekday/date for older days
//   - section       — "today" | "yesterday" | "this_week" | "earlier"
//   - spend         — Σ outflow slices on the day (no refunds, no FX)
//   - inflow        — Σ refund slices on the day (treated as positive)
//   - net           — inflow − spend (signed)
//   - count         — number of qualifying entries
//   - runningBalance — anchor + cumulative net up to AND including
//                      this day (oldest day first cumulative)
//
// Pure compute. No store, no React. Reuses sliceForMonth for
// installment math so a 1/12 plan shows the slice on its charge day.

import type { ExpenseEntry } from "@/types/finance";
import { sliceForMonth } from "@/lib/projections";
import { monthKeyOf } from "@/lib/dates";

export type TimelineSection = "today" | "yesterday" | "this_week" | "earlier";

export type DailyTimelineRow = {
  dayKey: string;
  timestamp: number;
  label: string;
  section: TimelineSection;
  spend: number;
  inflow: number;
  net: number;
  count: number;
  runningBalance: number;
  entries: ExpenseEntry[];
};

const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function sectionFor(rowStart: Date, now: Date): TimelineSection {
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const weekStart = new Date(today);
  // Israeli week starts Sunday (day 0). Walk back to most recent Sunday.
  weekStart.setDate(today.getDate() - today.getDay());
  if (rowStart.getTime() === today.getTime()) return "today";
  if (rowStart.getTime() === yesterday.getTime()) return "yesterday";
  if (rowStart >= weekStart) return "this_week";
  return "earlier";
}

function labelFor(row: Date, section: TimelineSection): string {
  if (section === "today") return "היום";
  if (section === "yesterday") return "אתמול";
  return DAY_FMT.format(row);
}

export function buildDailyTimeline(args: {
  entries: ExpenseEntry[];
  /** Starting balance to anchor the running line. Optional — when
   *  omitted, running balance is "from zero", which is still useful
   *  for visualising relative deltas. */
  anchorBalance?: number;
  /** Number of days to keep, counting back from `now`. Defaults to 30. */
  windowDays?: number;
  now?: Date;
}): DailyTimelineRow[] {
  const now = args.now ?? new Date();
  const windowDays = Math.max(1, args.windowDays ?? 30);
  const earliest = startOfDay(now);
  earliest.setDate(earliest.getDate() - (windowDays - 1));
  const earliestMs = earliest.getTime();

  // Bucket entries by day.
  const buckets = new Map<string, { spend: number; inflow: number; entries: ExpenseEntry[] }>();
  for (const e of args.entries) {
    if (e.needsConfirmation) continue;
    if (e.bankPending) continue;
    if (e.excludeFromBudget) continue;
    if (e.currency && e.currency !== "ILS") continue;
    // Use the slice for the entry's own month so multi-installment plans
    // contribute the right per-month amount on the right per-month day.
    const ts = new Date(e.chargeDate);
    if (Number.isNaN(ts.getTime())) continue;
    const slice = sliceForMonth(e, monthKeyOf(ts));
    if (!slice) continue;
    const day = startOfDay(slice.chargeDate);
    if (day.getTime() < earliestMs) continue;
    if (day.getTime() > now.getTime()) continue;
    const key = localDayKey(day);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { spend: 0, inflow: 0, entries: [] };
      buckets.set(key, bucket);
    }
    if (e.isRefund) {
      bucket.inflow += slice.amount;
    } else {
      bucket.spend += slice.amount;
    }
    bucket.entries.push(e);
  }

  // Walk every day in the window so empty days still appear in the
  // running-balance line. UI can hide bare days if desired.
  const rows: DailyTimelineRow[] = [];
  const cursor = new Date(earliest);
  while (cursor.getTime() <= now.getTime()) {
    const key = localDayKey(cursor);
    const bucket = buckets.get(key) ?? { spend: 0, inflow: 0, entries: [] };
    const stamp = new Date(cursor);
    stamp.setHours(12, 0, 0, 0);
    const section = sectionFor(new Date(cursor), now);
    rows.push({
      dayKey: key,
      timestamp: stamp.getTime(),
      label: labelFor(stamp, section),
      section,
      spend: round2(bucket.spend),
      inflow: round2(bucket.inflow),
      net: round2(bucket.inflow - bucket.spend),
      count: bucket.entries.length,
      runningBalance: 0,
      entries: bucket.entries.sort(
        (a, b) =>
          new Date(b.chargeDate).getTime() - new Date(a.chargeDate).getTime(),
      ),
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  // Running balance: oldest → newest.
  let running = args.anchorBalance ?? 0;
  for (let i = 0; i < rows.length; i++) {
    running += rows[i].net;
    rows[i].runningBalance = round2(running);
  }

  // Return newest first — the timeline scrolls top-down with today
  // at the top.
  return rows.reverse();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
