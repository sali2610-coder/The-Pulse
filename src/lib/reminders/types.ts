// Reminder scheduler — type contracts.
//
// Foundation only. Nothing in this module actually sends a push today;
// the existing Web Push pipeline serves category prompts for new
// transactions and is intentionally untouched. The scheduler defines
// WHAT to remind about + WHEN to fire so a future job (cron, server
// action, or client-side timer once the user has a stable PWA install)
// can pick reminders off a deterministic list.
//
// Source of truth for "did we already send this" lives outside this
// module — the dispatcher will key by (userId, reminderKey, date) so a
// re-evaluation in the same window is idempotent.

import type { MonthKey } from "@/types/finance";

export type ReminderSeverity = "info" | "warn" | "critical";

export type ReminderKind =
  /** A recurring rule is past its dayOfMonth this month with no paid status. */
  | "unpaid_recurring"
  /** A credit card's projected monthly burden crosses a high-pressure threshold. */
  | "high_card_pressure"
  /** The month's actual spend is approaching the user's monthlyBudget. */
  | "budget_approaching"
  /** An anchor (bank balance) has not been edited for N days. */
  | "stale_anchor";

export type Reminder = {
  /** Deterministic identity for idempotency. Format:
   *    <kind>:<entityId>:<monthKey>
   *  Lets the dispatcher dedupe within a single calendar month even if
   *  the evaluator runs many times. */
  key: string;
  kind: ReminderKind;
  severity: ReminderSeverity;
  /** Short Hebrew headline for the notification. */
  title: string;
  /** One-line Hebrew body. */
  body: string;
  /** When the reminder becomes due (ISO 8601). The dispatcher fires
   *  any reminder where dueAt <= now AND not yet sent. */
  dueAt: string;
  /** Optional deep-link the SW will open on tap. */
  deepLink?: string;
  /** Provenance — the entity that triggered the reminder. */
  source: {
    monthKey: MonthKey;
    entityId?: string;
  };
};

export type ReminderEvaluatorInput = {
  entries: import("@/types/finance").ExpenseEntry[];
  rules: import("@/types/finance").RecurringRule[];
  statuses: import("@/types/finance").RecurringStatus[];
  accounts: import("@/types/finance").Account[];
  monthlyBudget: number;
  /** Stamp used to compute dueAt + "is the day past" checks. Defaults
   *  to the caller's wall clock. */
  now?: Date;
  /** Threshold knobs so the same evaluator can be tuned by tests or
   *  per-user preferences later. */
  thresholds?: Partial<ReminderThresholds>;
};

export type ReminderThresholds = {
  /** Budget burn ratio that triggers `budget_approaching` (default 0.85). */
  budgetWarn: number;
  /** Card pressure ratio (totalThisMonth / creditLimit) that triggers
   *  `high_card_pressure` (default 0.75). */
  cardPressureWarn: number;
  /** Days since the last anchor edit that triggers `stale_anchor`
   *  (default 14). */
  staleAnchorDays: number;
};

export const DEFAULT_THRESHOLDS: ReminderThresholds = {
  budgetWarn: 0.85,
  cardPressureWarn: 0.75,
  staleAnchorDays: 14,
};
