// Phase 268 — month-first cashflow grouping shared across Home +
// Future tabs.
//
// View-layer compute. Reuses buildCashFlowBuckets for outflows and
// the existing income iteration logic for inflows, then re-buckets
// every event by its effectiveCash MonthKey. Each month carries:
//
//   • totalIncome / totalExpense / net
//   • per-source breakdowns (bank debits / cards / loans / income)
//
// Tone classification: current month, next month, future months —
// drives the visual tier and "open by default" gate.
//
// No engine change. Same numbers buildCashFlowBuckets produces; we
// just present them through a different lens.

import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { buildCashFlowBuckets } from "@/lib/cash-flow-bucket";
import { hebrewMonthFromKey } from "@/lib/card-month-grouping";

// Local copy — liquidity-curve's dateOfDayOfMonth helper isn't
// exported. Clamps overflow days (Feb 31 → Feb 28/29).
function dateOfDayOfMonth(args: { ref: Date; dayOfMonth: number }): Date {
  const y = args.ref.getFullYear();
  const m = args.ref.getMonth();
  const lastDay = new Date(y, m + 1, 0).getDate();
  const day = Math.min(Math.max(1, args.dayOfMonth), lastDay);
  return new Date(y, m, day, 12, 0, 0);
}

export type MonthlyCashflowEvent = {
  label: string;
  amount: number; // positive — signed via parent group
  effectiveCashAt: string;
  refId: string;
};

export type MonthlySourceGroup = {
  source: "bank_debit" | "card" | "loan" | "income";
  label: string;
  total: number;
  events: MonthlyCashflowEvent[];
};

export type MonthlyCashflowFolder = {
  monthKey: string;
  monthName: string;
  /** YYYY label for the header — Hebrew "יוני 2026". */
  fullLabel: string;
  tone: "current" | "next" | "future";
  totalIncome: number;
  totalExpense: number;
  net: number;
  bySource: {
    income: MonthlySourceGroup;
    bank_debit: MonthlySourceGroup;
    card: MonthlySourceGroup;
    loan: MonthlySourceGroup;
  };
};

const SOURCE_LABEL: Record<MonthlySourceGroup["source"], string> = {
  bank_debit: "הוראות קבע וישירות מהבנק",
  card: "כרטיסי אשראי",
  loan: "הלוואות",
  income: "הכנסות צפויות",
};

function currentMonthKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function nextMonthKey(now: Date): string {
  const d = addMonthsDate(now, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function addMonthsDate(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function toneOf(monthKey: string, now: Date): MonthlyCashflowFolder["tone"] {
  if (monthKey === currentMonthKey(now)) return "current";
  if (monthKey === nextMonthKey(now)) return "next";
  return "future";
}
function monthOfISO(iso: string): string {
  return iso.slice(0, 7);
}

function emptyGroup(source: MonthlySourceGroup["source"]): MonthlySourceGroup {
  return {
    source,
    label: SOURCE_LABEL[source],
    total: 0,
    events: [],
  };
}

function ensureFolder(
  map: Map<string, MonthlyCashflowFolder>,
  monthKey: string,
  now: Date,
): MonthlyCashflowFolder {
  const found = map.get(monthKey);
  if (found) return found;
  const monthName = hebrewMonthFromKey(monthKey);
  const year = monthKey.split("-")[0];
  const fresh: MonthlyCashflowFolder = {
    monthKey,
    monthName,
    fullLabel: `${monthName} ${year}`,
    tone: toneOf(monthKey, now),
    totalIncome: 0,
    totalExpense: 0,
    net: 0,
    bySource: {
      income: emptyGroup("income"),
      bank_debit: emptyGroup("bank_debit"),
      card: emptyGroup("card"),
      loan: emptyGroup("loan"),
    },
  };
  map.set(monthKey, fresh);
  return fresh;
}

export function buildMonthlyCashflow(args: {
  accounts: Account[];
  loans: Loan[];
  incomes: Income[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  entries: ExpenseEntry[];
  now?: Date;
  /** Project forward this many days. Default 90. */
  windowDays?: number;
}): MonthlyCashflowFolder[] {
  const now = args.now ?? new Date();
  const windowDays = Math.max(1, args.windowDays ?? 90);
  const horizon = new Date(now.getTime() + windowDays * 86_400_000);

  const buckets = buildCashFlowBuckets({
    accounts: args.accounts,
    loans: args.loans,
    rules: args.rules,
    statuses: args.statuses,
    entries: args.entries,
    now,
    windowDays,
  });

  const folders = new Map<string, MonthlyCashflowFolder>();

  // Outflows from the canonical cash-flow buckets.
  for (const bucket of buckets.buckets) {
    for (const ob of bucket.obligations) {
      const monthKey = monthOfISO(ob.effectiveCashAt);
      const folder = ensureFolder(folders, monthKey, now);
      const group = folder.bySource[bucket.source];
      group.events.push({
        label: ob.label,
        amount: ob.amount,
        effectiveCashAt: ob.effectiveCashAt,
        refId: ob.refId,
      });
      group.total += ob.amount;
      folder.totalExpense += ob.amount;
    }
  }

  // Incomes — walk every month inside the window like the
  // liquidity-curve income loop (Phase 259). Skip past dates.
  const maxMonths = Math.ceil(windowDays / 28) + 1;
  for (const inc of args.incomes) {
    if (!inc.active) continue;
    if (inc.amount <= 0) continue;
    for (let m = 0; m <= maxMonths; m++) {
      const date = dateOfDayOfMonth({
        ref: addMonthsDate(now, m),
        dayOfMonth: inc.dayOfMonth,
      });
      if (date.getTime() > horizon.getTime()) break;
      if (date.getTime() <= now.getTime()) continue;
      const monthKey = `${date.getFullYear()}-${String(
        date.getMonth() + 1,
      ).padStart(2, "0")}`;
      const folder = ensureFolder(folders, monthKey, now);
      folder.bySource.income.events.push({
        label: inc.label,
        amount: inc.amount,
        effectiveCashAt: date.toISOString(),
        refId: inc.id,
      });
      folder.bySource.income.total += inc.amount;
      folder.totalIncome += inc.amount;
    }
  }

  // Finalize.
  const out: MonthlyCashflowFolder[] = [];
  for (const folder of folders.values()) {
    folder.net = round2(folder.totalIncome - folder.totalExpense);
    folder.totalIncome = round2(folder.totalIncome);
    folder.totalExpense = round2(folder.totalExpense);
    folder.bySource.income.total = round2(folder.bySource.income.total);
    folder.bySource.bank_debit.total = round2(
      folder.bySource.bank_debit.total,
    );
    folder.bySource.card.total = round2(folder.bySource.card.total);
    folder.bySource.loan.total = round2(folder.bySource.loan.total);
    for (const group of Object.values(folder.bySource)) {
      group.events.sort(
        (a, b) =>
          new Date(a.effectiveCashAt).getTime() -
          new Date(b.effectiveCashAt).getTime(),
      );
    }
    out.push(folder);
  }
  out.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
