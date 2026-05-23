// Confidence scoring for the trust layer.
//
// Each major dashboard metric carries a coarse confidence rating
// (high / medium / low). The chip is intentionally subtle — never a
// warning — so a user sees at a glance whether the number is based
// on hard inputs (anchors, scheduled rules) or on inference
// (merchant guesses, sparse history).

import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
} from "@/types/finance";

export type ConfidenceLevel = "high" | "medium" | "low";

export type ConfidenceReport = {
  level: ConfidenceLevel;
  /** Short Hebrew explainer rendered next to the chip in explain
   *  sheets. Never a "warning"; just describes the basis. */
  basis: string;
};

const HIGH = (basis: string): ConfidenceReport => ({ level: "high", basis });
const MED = (basis: string): ConfidenceReport => ({ level: "medium", basis });
const LOW = (basis: string): ConfidenceReport => ({ level: "low", basis });

export function confidenceForSpentThisMonth(args: {
  entries: ExpenseEntry[];
}): ConfidenceReport {
  const total = args.entries.length;
  if (total === 0) return LOW("טרם נרשמו חיובים החודש");
  const unconfirmed = args.entries.filter(
    (e) => e.needsConfirmation || e.bankPending,
  ).length;
  if (unconfirmed === 0) return HIGH("רק חיובים שכבר נסגרו");
  const ratio = unconfirmed / total;
  if (ratio > 0.25) return MED(`${unconfirmed} חיובים עדיין במצב מאשרים`);
  return HIGH("רוב החיובים נסגרו במלואם");
}

export function confidenceForBridge(args: {
  accounts: Account[];
  incomes: Income[];
  loans: Loan[];
  rules: RecurringRule[];
}): ConfidenceReport {
  const anchors = args.accounts.filter(
    (a) => a.active && a.kind === "bank" && typeof a.anchorBalance === "number",
  );
  if (anchors.length === 0) return LOW("לא הוגדרה יתרת בנק כעוגן");
  const hasIncome = args.incomes.some((i) => i.active && i.amount > 0);
  const hasObligationKnowledge =
    args.loans.some((l) => l.active) || args.rules.some((r) => r.active);
  if (hasIncome && hasObligationKnowledge) {
    return HIGH("עוגן בנק + הכנסות + התחייבויות מוגדרות");
  }
  if (anchors.length > 0 && (hasIncome || hasObligationKnowledge)) {
    return MED("עוגן בנק קיים אך חלק מהמרכיבים חסרים");
  }
  return LOW("יש עוגן אך לא הוגדרו הכנסות / התחייבויות");
}
