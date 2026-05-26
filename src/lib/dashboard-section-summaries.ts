// Phase 225 — collapsed-state summaries for the simple-mode
// dashboard sections.
//
// Pure compute. Returns one short string + a tone per section so the
// user can read each section's bottom line without expanding. Every
// number is derived from existing engines — no new financial logic.

import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { liquidityCurve } from "@/lib/liquidity-curve";
import { buildCashFlowBuckets } from "@/lib/cash-flow-bucket";
import { buildRiskWarnings } from "@/lib/risk-warnings";
import { monthKeyOf } from "@/lib/dates";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export type SectionSummary = {
  value: string;
  tone: "ok" | "warn" | "danger" | "info";
};

export type SummariesInput = {
  accounts: Account[];
  loans: Loan[];
  incomes: Income[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  entries: ExpenseEntry[];
  monthlyBudget: number;
  now?: Date;
};

export type DashboardSummaries = {
  future: SectionSummary;
  cards: SectionSummary;
  obligations: SectionSummary;
  income: SectionSummary;
  analytics: SectionSummary;
  watch: SectionSummary;
};

export function computeSummaries(input: SummariesInput): DashboardSummaries {
  const now = input.now ?? new Date();
  const monthKey = monthKeyOf(now);

  const curve = liquidityCurve({
    accounts: input.accounts,
    loans: input.loans,
    incomes: input.incomes,
    rules: input.rules,
    statuses: input.statuses,
    entries: input.entries,
    now,
  });
  const buckets = buildCashFlowBuckets({
    accounts: input.accounts,
    loans: input.loans,
    rules: input.rules,
    statuses: input.statuses,
    entries: input.entries,
    now,
  });

  // ── Future cash-flow window summary ────────────────────────────
  // Use the 35-day curve outflow as the headline number. Tone flips
  // red when the window crosses negative; amber when the lowest
  // point dips below 1000 ILS but stays positive.
  const future: SectionSummary = curve.crossesNegative
    ? {
        value: `מינוס ביום ${curve.lowestPoint.dayIndex}`,
        tone: "danger",
      }
    : curve.lowestPoint.balance < 1000
      ? {
          value: `נקודה נמוכה ${ILS.format(Math.round(curve.lowestPoint.balance))}`,
          tone: "warn",
        }
      : {
          value: `יציאות ${ILS.format(Math.round(curve.totalOutflow))}`,
          tone: "info",
        };

  // ── Cards summary — sum of obligations in the card buckets ──
  let cardSum = 0;
  let cardCount = 0;
  let nextCardSettlement: string | null = null;
  for (const b of buckets.buckets) {
    if (b.source !== "card") continue;
    cardSum += b.monthlyTotal;
    cardCount += b.obligationCount;
    if (
      b.nextSettlementAt &&
      (!nextCardSettlement || b.nextSettlementAt < nextCardSettlement)
    ) {
      nextCardSettlement = b.nextSettlementAt;
    }
  }
  const cards: SectionSummary =
    cardCount === 0
      ? { value: "אין חיובי כרטיס", tone: "ok" }
      : { value: ILS.format(Math.round(cardSum)), tone: "info" };

  // ── Obligations summary — loans + bank-debit rules ──
  let obligSum = 0;
  for (const b of buckets.buckets) {
    if (b.source === "loan" || b.source === "bank_debit") {
      obligSum += b.monthlyTotal;
    }
  }
  const obligations: SectionSummary =
    obligSum === 0
      ? { value: "אין התחייבויות", tone: "ok" }
      : { value: ILS.format(Math.round(obligSum)), tone: "info" };

  // ── Incomes summary — next active income ──
  const today = now.getDate();
  const activeIncomes = input.incomes
    .filter((i) => i.active && i.dayOfMonth >= today)
    .sort((a, b) => a.dayOfMonth - b.dayOfMonth);
  const totalActive = input.incomes
    .filter((i) => i.active)
    .reduce((s, i) => s + i.amount, 0);
  const income: SectionSummary =
    totalActive === 0
      ? { value: "אין הכנסה פעילה", tone: "warn" }
      : activeIncomes[0]
        ? {
            value: `${ILS.format(activeIncomes[0].amount)} ב-${activeIncomes[0].dayOfMonth}`,
            tone: "ok",
          }
        : { value: ILS.format(totalActive), tone: "ok" };

  // ── Analytics summary — count of entries this month ──
  let monthlyEntries = 0;
  for (const e of input.entries) {
    if (e.chargeDate.startsWith(monthKey)) monthlyEntries++;
  }
  const analytics: SectionSummary = {
    value: `${monthlyEntries} חיובים החודש`,
    tone: "info",
  };

  // ── Watch summary — count of risk warnings ──
  const warnings = buildRiskWarnings({
    accounts: input.accounts,
    loans: input.loans,
    incomes: input.incomes,
    rules: input.rules,
    entries: input.entries,
    statuses: input.statuses,
    monthlyBudget: input.monthlyBudget,
    monthKey,
    now,
  });
  const alertCount = warnings.filter((w) => w.severity === "alert").length;
  const warnCount = warnings.filter((w) => w.severity === "warn").length;
  const watch: SectionSummary =
    alertCount > 0
      ? { value: `${alertCount} התראות`, tone: "danger" }
      : warnCount > 0
        ? { value: `${warnCount} אזהרות`, tone: "warn" }
        : warnings.length > 0
          ? { value: `${warnings.length} שווה לבדוק`, tone: "info" }
          : { value: "אין חריגות", tone: "ok" };

  return { future, cards, obligations, income, analytics, watch };
}
