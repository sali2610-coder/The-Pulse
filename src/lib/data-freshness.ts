// Data-freshness probe.
//
// Aggregates "how current is what you're looking at?" signals into
// one report the dashboard renders as a tiny stamp. Drives the
// trust-layer line under primary cards: "עודכן לאחרונה לפני …,
// מציג נתונים עד יום … בחודש".

import type {
  ExpenseEntry,
  Income,
  Loan,
  MonthKey,
  RecurringRule,
} from "@/types/finance";
import { daysInMonth } from "@/lib/projections";
import { monthKeyOf } from "@/lib/dates";

export type FreshnessReport = {
  monthKey: MonthKey;
  /** ISO of the most recent successful cloud sync, or null. */
  lastSyncAt: string | null;
  ageOfLastSyncSeconds: number | null;
  /** ISO of the most recent qualifying transaction, or null. */
  lastTransactionAt: string | null;
  /** ISO of the day this report's projections are good through —
   *  end-of-month for the projected metric. */
  projectedThroughISO: string;
  /** Hebrew explainer rendered under the freshness stamp. */
  projectedThroughText: string;
  /** Day-of-month for the next active income (1..31) or null. */
  nextIncomeDay: number | null;
  /** Same for the next obligation (loan or recurring rule). */
  nextObligationDay: number | null;
  /** Coarse staleness bucket — UI tints accordingly. */
  bucket: "fresh" | "ok" | "stale";
};

const MONTH_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "long",
});

export function dataFreshness(args: {
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  loans: Loan[];
  incomes: Income[];
  lastSyncedAt: number;
  now?: Date;
}): FreshnessReport {
  const now = args.now ?? new Date();
  const monthKey: MonthKey = monthKeyOf(now);
  const today = now.getDate();
  const totalDays = daysInMonth(monthKey);

  const lastTx = mostRecentEntry(args.entries);
  const lastSyncAtIso =
    args.lastSyncedAt > 0
      ? new Date(args.lastSyncedAt).toISOString()
      : null;
  const ageSec =
    args.lastSyncedAt > 0
      ? Math.max(0, Math.floor((now.getTime() - args.lastSyncedAt) / 1000))
      : null;

  // End-of-month projection horizon.
  const eom = new Date(now);
  eom.setDate(totalDays);
  eom.setHours(23, 59, 59, 0);

  return {
    monthKey,
    lastSyncAt: lastSyncAtIso,
    ageOfLastSyncSeconds: ageSec,
    lastTransactionAt: lastTx?.chargeDate ?? null,
    projectedThroughISO: eom.toISOString(),
    projectedThroughText: `מציג תחזית עד ${MONTH_FMT.format(eom)}`,
    nextIncomeDay: nextScheduledDay(
      args.incomes
        .filter((i) => i.active && i.amount > 0)
        .map((i) => i.dayOfMonth),
      today,
    ),
    nextObligationDay: nextScheduledDay(
      [
        ...args.loans.filter((l) => l.active).map((l) => l.dayOfMonth),
        ...args.rules.filter((r) => r.active).map((r) => r.dayOfMonth),
      ],
      today,
    ),
    bucket:
      ageSec === null
        ? "stale"
        : ageSec < 60 * 60
          ? "fresh"
          : ageSec < 24 * 60 * 60
            ? "ok"
            : "stale",
  };
}

function mostRecentEntry(entries: ExpenseEntry[]): ExpenseEntry | null {
  let best: ExpenseEntry | null = null;
  let bestTs = -Infinity;
  for (const e of entries) {
    if (e.needsConfirmation) continue;
    if (e.bankPending) continue;
    if (e.excludeFromBudget) continue;
    const ts = new Date(e.chargeDate).getTime();
    if (Number.isNaN(ts)) continue;
    if (ts > bestTs) {
      best = e;
      bestTs = ts;
    }
  }
  return best;
}

function nextScheduledDay(days: number[], today: number): number | null {
  const future = days.filter((d) => d >= today).sort((a, b) => a - b);
  if (future.length > 0) return future[0];
  const earliest = [...days].sort((a, b) => a - b)[0];
  return earliest ?? null;
}
