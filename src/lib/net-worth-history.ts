// Net-worth monthly snapshot history.
//
// Captures one point per (monthKey, userScope) at the first dashboard
// render of each calendar month. Persists locally — no cloud round-
// trip required, no PII concern. FIFO-bounded at 24 entries so the
// store can't grow unbounded.
//
// Pure storage layer. UI consumers ask `listSnapshots()` for an
// ascending-by-month series suitable for a sparkline. The
// computation of the value itself lives in `lib/net-worth.ts` —
// this module never recomputes it.

import type { MonthKey } from "@/types/finance";
import { monthKeyOf } from "@/lib/dates";

const STORAGE_KEY = "sally.networth.snapshots.v1";
const MAX_ENTRIES = 24;

export type NetWorthSnapshot = {
  monthKey: MonthKey;
  netWorth: number;
  capturedAt: number;
};

function readAll(): NetWorthSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as NetWorthSnapshot[];
  } catch {
    return [];
  }
}

function writeAll(list: NetWorthSnapshot[]): void {
  if (typeof window === "undefined") return;
  try {
    // Keep oldest-first ordering on disk; trim from the FRONT so
    // the freshest 24 months survive.
    const sorted = list.slice().sort((a, b) => a.monthKey.localeCompare(b.monthKey));
    const trimmed = sorted.slice(-MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* quota / disabled — degrade silently */
  }
}

/** Record a snapshot for the given month. Idempotent: a second call
 *  for the same monthKey REPLACES the previous value (so a same-day
 *  anchor edit updates the chart, but doesn't double-write). Returns
 *  the persisted snapshot. */
export function recordSnapshot(args: {
  netWorth: number;
  monthKey?: MonthKey;
  now?: Date;
}): NetWorthSnapshot {
  const monthKey =
    args.monthKey ?? monthKeyOf(args.now ?? new Date());
  const snap: NetWorthSnapshot = {
    monthKey,
    netWorth: args.netWorth,
    capturedAt: (args.now ?? new Date()).getTime(),
  };
  const list = readAll().filter((s) => s.monthKey !== monthKey);
  list.push(snap);
  writeAll(list);
  return snap;
}

/** Ascending-by-month list of snapshots. */
export function listSnapshots(): NetWorthSnapshot[] {
  return readAll()
    .slice()
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

export function clearSnapshots(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Test/dev helper — alias for clearSnapshots so the file mirrors
 *  the convention used by error-log + analytics. */
export function _resetNetWorthHistoryForTests(): void {
  clearSnapshots();
}
