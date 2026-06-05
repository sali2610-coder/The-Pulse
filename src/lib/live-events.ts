// Phase 383 — Live AI events feed.
//
// Derives a small, recent activity stream from store state. No
// persistence — every render walks the same data and surfaces:
//
//   • new card charges (entries with paymentMethod === "credit" in
//     the last 24h)
//   • new bank-direct entries in the last 24h
//   • rules likely ending soon (installmentTotal known + month
//     window short)
//   • income updates touched recently
//
// Lightweight, fast, and bounded to N events.

import type {
  ExpenseEntry,
  Income,
  RecurringRule,
} from "@/types/finance";

export type LiveEventKind =
  | "cardCharge"
  | "bankCharge"
  | "ruleEnding"
  | "incomeUpdate";

export type LiveEvent = {
  id: string;
  kind: LiveEventKind;
  /** Hebrew sentence the feed renders directly. */
  label: string;
  /** ms epoch — used for relative-time formatting + sort. */
  at: number;
};

const DAY = 86_400_000;
const RECENT_WINDOW_MS = 24 * 3600 * 1000;

function entryRecency(e: ExpenseEntry, now: number): number {
  const candidates = [e.occurredAt, e.createdAt, e.chargeDate];
  for (const iso of candidates) {
    if (!iso) continue;
    const t = new Date(iso).getTime();
    if (!Number.isNaN(t) && t <= now) return t;
  }
  return 0;
}

export function buildLiveEvents(args: {
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  incomes: Income[];
  now?: Date;
  /** Max events to return. Default 6. */
  cap?: number;
}): LiveEvent[] {
  const now = (args.now ?? new Date()).getTime();
  const cap = args.cap ?? 6;
  const events: LiveEvent[] = [];

  for (const e of args.entries) {
    if (e.transactionType === "withdrawal") continue;
    if (e.isRefund) continue;
    if (e.excludeFromBudget) continue;
    const at = entryRecency(e, now);
    if (!at || now - at > RECENT_WINDOW_MS) continue;
    const merchant = e.merchant ?? e.note ?? "חיוב";
    if (e.paymentMethod === "credit") {
      events.push({
        id: `cardCharge:${e.id}`,
        kind: "cardCharge",
        label: `חיוב חדש זוהה באשראי · ${merchant}`,
        at,
      });
    } else {
      events.push({
        id: `bankCharge:${e.id}`,
        kind: "bankCharge",
        label: `חיוב חדש זוהה בבנק · ${merchant}`,
        at,
      });
    }
  }

  // Rules likely ending soon (installmentTotal set + close to last
  // payment given month start). Heuristic: cheap proxy without
  // touching the schedule engine.
  for (const r of args.rules) {
    if (!r.active) continue;
    if (!r.installmentTotal) continue;
    if (!r.startMonth || !r.startYear) continue;
    const start = new Date(r.startYear, r.startMonth - 1, 1).getTime();
    const elapsedMonths = Math.floor((now - start) / (30 * DAY));
    const remaining = r.installmentTotal - elapsedMonths;
    if (remaining > 1 || remaining < 0) continue;
    events.push({
      id: `ruleEnding:${r.id}`,
      kind: "ruleEnding",
      label: `חיוב קבוע מסתיים · ${r.label}`,
      at: now - 3_600_000, // ~"לפני שעה"
    });
  }

  for (const inc of args.incomes) {
    if (!inc.actualByMonth || Object.keys(inc.actualByMonth).length === 0)
      continue;
    // Income overrides are amounts keyed by monthKey — no per-entry
    // timestamps. Treat presence of any override this month as a
    // recent update so the feed surfaces the change.
    const monthKey = new Date(now).toISOString().slice(0, 7);
    const override = inc.actualByMonth[monthKey];
    if (override === undefined || override === null) continue;
    events.push({
      id: `incomeUpdate:${inc.id}:${monthKey}`,
      kind: "incomeUpdate",
      label: `הכנסה עודכנה · ${inc.label}`,
      at: now - 5 * 3_600_000,
    });
  }

  events.sort((a, b) => b.at - a.at);
  return events.slice(0, cap);
}

/** Hebrew relative time string. */
export function formatRelative(at: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - at);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "כעת";
  if (min < 60) return `לפני ${min} דק׳`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `לפני ${hr} שעות`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `לפני ${day} ימים`;
  return "לפני יותר מחודש";
}
