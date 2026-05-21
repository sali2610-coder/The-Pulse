// Local safety snapshots.
//
// A SECOND persistence layer that survives identity changes,
// Zustand re-hydration, Supabase session hydrate, and any
// remote-state-sync apply. Used as the last-resort recovery
// surface when the cloud restore path doesn't bring back full
// data.
//
// Storage key is independent of the Zustand persist namespace
// (sally.finance) and of the auth scope, so an account swap CAN
// NOT delete it. Capped at 20 entries with FIFO eviction.
//
// Critical safety property:
//   Every potentially-destructive flow MUST call
//   `captureSafetyBackup("reason")` BEFORE mutating local state.

import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";

const STORAGE_KEY = "sally.safety.snapshots.v1";
const MAX_ENTRIES = 20;

export type SafetyPayload = {
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  accounts: Account[];
  loans: Loan[];
  incomes: Income[];
  monthlyBudget: number;
  lastSyncedAt: number;
  audioEnabled: boolean;
};

export type SafetyCounts = {
  entries: number;
  rules: number;
  statuses: number;
  accounts: number;
  loans: number;
  incomes: number;
  monthlyBudget: number;
  richness: number;
};

export type SafetyReason =
  | "pre-sign-in"
  | "pre-sign-out"
  | "pre-account-switch"
  | "pre-remote-apply"
  | "pre-restore"
  | "pre-supabase-hydrate"
  | "manual"
  | "auto-tick";

export type SafetySnapshot = {
  id: string;
  reason: SafetyReason;
  capturedAt: number;
  counts: SafetyCounts;
  payload: SafetyPayload;
};

function readAll(): SafetySnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as SafetySnapshot[];
  } catch {
    return [];
  }
}

function writeAll(snapshots: SafetySnapshot[]): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = snapshots.slice(-MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* quota / disabled — degrade silently */
  }
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `safety-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function richness(counts: {
  entries: number;
  rules: number;
  accounts: number;
  loans: number;
  incomes: number;
  monthlyBudget: number;
}): number {
  return (
    counts.entries +
    counts.rules +
    counts.accounts +
    counts.loans +
    counts.incomes +
    (counts.monthlyBudget > 0 ? 1 : 0)
  );
}

export function summarizePayload(p: SafetyPayload): SafetyCounts {
  const base = {
    entries: p.entries.length,
    rules: p.rules.length,
    statuses: p.statuses.length,
    accounts: p.accounts.length,
    loans: p.loans.length,
    incomes: p.incomes.length,
    monthlyBudget: p.monthlyBudget,
  };
  return { ...base, richness: richness(base) };
}

/** Take a snapshot of the current store + persist to local-only
 *  safety storage. Returns the new snapshot's id. */
export function captureSafetyBackup(
  reason: SafetyReason,
  payload: SafetyPayload,
): SafetySnapshot {
  const counts = summarizePayload(payload);
  const snap: SafetySnapshot = {
    id: uid(),
    reason,
    capturedAt: Date.now(),
    counts,
    payload,
  };
  // Skip the write entirely when the payload is empty — no
  // recovery value, and we don't want to crowd out a real rich
  // snapshot via the FIFO trim.
  if (counts.richness === 0) return snap;
  const list = readAll();
  list.push(snap);
  writeAll(list);
  return snap;
}

export function listSafetyBackups(): SafetySnapshot[] {
  return readAll()
    .slice()
    .sort((a, b) => b.capturedAt - a.capturedAt);
}

export function findRichestSafetyBackup(): SafetySnapshot | null {
  const list = readAll();
  if (list.length === 0) return null;
  let best = list[0];
  for (const s of list) {
    if (s.counts.richness > best.counts.richness) best = s;
    else if (
      s.counts.richness === best.counts.richness &&
      s.capturedAt > best.capturedAt
    ) {
      best = s;
    }
  }
  return best;
}

export function deleteSafetyBackup(id: string): void {
  const list = readAll().filter((s) => s.id !== id);
  writeAll(list);
}

export function clearSafetyBackups(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
