// Tracking-streak detector.
//
// Counts consecutive days the user has had at least one expense
// entry. Habit-formation metric — surfaces "you've been tracking
// every day for 12 days". Pure compute over the entry log; no
// schema, no persistence.
//
// Days are bucketed in the user's local timezone via the JS Date
// object so a Tel Aviv midnight doesn't get attributed to UTC.

import type { ExpenseEntry } from "@/types/finance";

export type TrackingStreak = {
  /** Days back from `now` where at least one entry exists every day.
   *  `now` itself counts when there's at least one entry today. */
  currentDays: number;
  /** Longest streak observed within the last 90 days. Captures the
   *  user's personal best so the UI can celebrate it. */
  longestDays: number;
  /** ISO date string of the most recently-tracked day, or null when
   *  no entries exist at all. */
  lastTrackedDate: string | null;
};

const LOOKBACK_DAYS = 90;

function dateKeyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function offsetDateKey(now: Date, daysBack: number): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysBack);
  return dateKeyOf(d);
}

export function computeTrackingStreak(args: {
  entries: ExpenseEntry[];
  now?: Date;
}): TrackingStreak {
  const now = args.now ?? new Date();
  const trackedDays = new Set<string>();
  let mostRecent: string | null = null;
  for (const entry of args.entries) {
    const ts = new Date(entry.createdAt);
    if (Number.isNaN(ts.getTime())) continue;
    const key = dateKeyOf(ts);
    trackedDays.add(key);
    if (!mostRecent || key > mostRecent) mostRecent = key;
  }

  let current = 0;
  for (let i = 0; i < LOOKBACK_DAYS; i++) {
    const key = offsetDateKey(now, i);
    if (trackedDays.has(key)) {
      current++;
    } else {
      break;
    }
  }

  // Longest streak inside the lookback window.
  let longest = current;
  let running = 0;
  for (let i = 0; i < LOOKBACK_DAYS; i++) {
    const key = offsetDateKey(now, i);
    if (trackedDays.has(key)) {
      running++;
      if (running > longest) longest = running;
    } else {
      running = 0;
    }
  }

  return {
    currentDays: current,
    longestDays: longest,
    lastTrackedDate: mostRecent,
  };
}
