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
import { monthKeyOf } from "@/lib/dates";
import { detectAnomalies } from "@/lib/anomalies";
import { subscriptionReview } from "@/lib/subscription-review";
import { detectSubscriptionCandidates } from "@/lib/subscription-detector";
import { isInsightDismissed } from "@/lib/insight-dismiss";

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

  // ── Watch summary — counts what's actually IN the section body.
  //
  // Phase 315 — RiskWarningsCard moved to the Expenses tab in
  // Phase 301; deriving this chip from buildRiskWarnings produced
  // a "1 התראה" badge while the section body itself was empty,
  // which read as a fake alert. Now we count the same detectors
  // the body renders: AnomaliesCard / SubscriptionReviewCard /
  // SubscriptionRadarCard. Honor dismissed insights so a chip the
  // user already ignored doesn't keep nagging.
  const anomalies = detectAnomalies({
    entries: input.entries,
    monthKey,
  });
  const subscriptionReviewItems = subscriptionReview({
    rules: input.rules,
    entries: input.entries,
    now,
  });
  const subscriptionCandidates = detectSubscriptionCandidates({
    entries: input.entries,
    rules: input.rules,
  }).filter((c) => !isInsightDismissed("subscription", c.merchantKey));
  const watchTotal =
    anomalies.length +
    subscriptionReviewItems.length +
    subscriptionCandidates.length;
  const watch: SectionSummary =
    watchTotal === 0
      ? { value: "הכל תקין", tone: "ok" }
      : anomalies.length > 0
        ? { value: `${watchTotal} לבדיקה`, tone: "warn" }
        : { value: `${watchTotal} לבדיקה`, tone: "info" };

  return { future, cards, obligations, income, analytics, watch };
}
