// Phase 371 — canonical Credit Card Exposure.
//
// Single source of truth answering "כמה הכרטיסים יעלו לי החודש?".
// Every surface that wants a credit-card monthly total reads this
// helper (or routes through getMonthlyObligationBreakdown which
// internally aligns with it).
//
// Composition rules (every shekel counted EXACTLY once):
//
//   futureCardCharges       Σ active card-settled recurring rules
//                           scheduled this month, NOT yet marked paid.
//                           Includes installment-plan rules.
//
//   existingInstallments    Σ THIS-MONTH slices of confirmed past
//                           multi-installment card entries. The slice
//                           math (sliceForMonth) handles the
//                           per-month split.
//
//   walletTransactions      Σ this-month entry slices from
//                           source="wallet" entries, confirmed,
//                           paymentMethod=credit.
//
//   importedTransactions    Σ this-month entry slices from source
//                           "sms" entries OR externalId prefixed
//                           "import:" (CSV statement import),
//                           paymentMethod=credit.
//
//   manualCardTransactions  Σ this-month entry slices from
//                           source="manual" + paymentMethod="credit"
//                           that are NOT installment plans (instalments
//                           <= 1) — multi-instalment manual entries
//                           live in existingInstallments to avoid
//                           overlap.
//
//   pendingTransactions     Σ this-month entry slices on cards
//                           awaiting user confirmation
//                           (needsConfirmation) or bank-side
//                           settlement (bankPending). Tracked
//                           separately so the user can see what's
//                           uncertain.
//
// Invariants (pinned by tests):
//
//   • Every entry.id appears in AT MOST one of the entry-derived
//     buckets (existingInstallments / wallet / imported / manual /
//     pending).
//   • Every rule.id appears in AT MOST futureCardCharges.
//   • totalExpectedCharge = Σ of all six buckets.
//   • A withdrawal entry (transactionType="withdrawal") NEVER
//     contributes — withdrawals are CASH, not card.
//   • A refund (isRefund=true) NEVER contributes — refunds are not
//     forward commitments.
//   • An entry with currency !== "ILS" is excluded (FX not modelled).
//   • An entry with excludeFromBudget=true is excluded.
//
// Engine math untouched. This helper composes existing slice + rule
// schedule + isRuleCardSettled outputs.

import type {
  ExpenseEntry,
  MonthKey,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { sliceForMonth } from "@/lib/projections";
import { ruleSchedule } from "@/lib/installment-schedule";
import { isRuleCardSettled } from "@/lib/rule-settlement";

export type CreditCardExposureBucket =
  | "futureCardCharges"
  | "existingInstallments"
  | "walletTransactions"
  | "importedTransactions"
  | "manualCardTransactions"
  | "pendingTransactions";

export type CreditExposureRow = {
  id: string;
  bucket: CreditCardExposureBucket;
  label: string;
  amount: number;
  kind: "rule" | "entry";
};

export type CreditCardExposure = {
  monthKey: MonthKey;
  futureCardCharges: number;
  existingInstallments: number;
  walletTransactions: number;
  importedTransactions: number;
  manualCardTransactions: number;
  pendingTransactions: number;
  totalExpectedCharge: number;
  counts: Record<CreditCardExposureBucket, number>;
  breakdown: CreditExposureRow[];
  /** Number of entries skipped because they were classified into
   *  multiple buckets — diagnostics surface for the dev panel. */
  duplicatesPrevented: number;
};

function isCardEntry(e: ExpenseEntry): boolean {
  if (e.paymentMethod !== "credit") return false;
  if (e.transactionType === "withdrawal") return false;
  if (e.isRefund) return false;
  if (e.excludeFromBudget) return false;
  if (e.currency && e.currency !== "ILS") return false;
  return true;
}

function isImportedSource(e: ExpenseEntry): boolean {
  if (e.source === "sms") return true;
  if (e.externalId?.startsWith("import:")) return true;
  return false;
}

function isPendingOnCard(e: ExpenseEntry): boolean {
  if ((e.needsConfirmation && !e.confirmedAt) || e.bankPending) return true;
  return false;
}

function classifyEntry(e: ExpenseEntry): CreditCardExposureBucket | null {
  if (!isCardEntry(e)) return null;
  if (isPendingOnCard(e)) return "pendingTransactions";
  // Installments > 1 → existingInstallments regardless of source so
  // the BNPL bucket reads correctly.
  if (e.installments > 1) return "existingInstallments";
  if (e.source === "wallet") return "walletTransactions";
  if (isImportedSource(e)) return "importedTransactions";
  if (e.source === "manual") return "manualCardTransactions";
  // Auto-source single-installment entries fall back to imported
  // (they came from auto-sync somehow).
  if (e.source === "auto") return "importedTransactions";
  return "importedTransactions";
}

export function getCreditCardExposure(args: {
  rules: RecurringRule[];
  entries: ExpenseEntry[];
  statuses: RecurringStatus[];
  monthKey: MonthKey;
}): CreditCardExposure {
  let futureCardCharges = 0;
  let existingInstallments = 0;
  let walletTransactions = 0;
  let importedTransactions = 0;
  let manualCardTransactions = 0;
  let pendingTransactions = 0;
  const counts: Record<CreditCardExposureBucket, number> = {
    futureCardCharges: 0,
    existingInstallments: 0,
    walletTransactions: 0,
    importedTransactions: 0,
    manualCardTransactions: 0,
    pendingTransactions: 0,
  };
  const breakdown: CreditExposureRow[] = [];
  const seen = new Set<string>();
  let duplicatesPrevented = 0;

  // ── Rules ────────────────────────────────────────────────────
  const paidStatuses = new Set(
    args.statuses
      .filter(
        (s) => s.monthKey === args.monthKey && s.status === "paid",
      )
      .map((s) => s.ruleId),
  );
  for (const r of args.rules) {
    if (!r.active) continue;
    if (paidStatuses.has(r.id)) continue;
    if (!ruleSchedule(r, args.monthKey).active) continue;
    if (!isRuleCardSettled(r)) continue;
    const id = `rule:${r.id}`;
    if (seen.has(id)) {
      duplicatesPrevented += 1;
      continue;
    }
    seen.add(id);
    futureCardCharges += r.estimatedAmount;
    counts.futureCardCharges += 1;
    breakdown.push({
      id,
      bucket: "futureCardCharges",
      label: r.label,
      amount: r.estimatedAmount,
      kind: "rule",
    });
  }

  // ── Entries ─────────────────────────────────────────────────
  for (const e of args.entries) {
    const bucket = classifyEntry(e);
    if (!bucket) continue;
    const slice = sliceForMonth(e, args.monthKey);
    if (!slice) continue;
    const id = `entry:${e.id}`;
    if (seen.has(id)) {
      duplicatesPrevented += 1;
      continue;
    }
    seen.add(id);
    const amount = Math.abs(slice.amount);
    switch (bucket) {
      case "existingInstallments":
        existingInstallments += amount;
        counts.existingInstallments += 1;
        break;
      case "walletTransactions":
        walletTransactions += amount;
        counts.walletTransactions += 1;
        break;
      case "importedTransactions":
        importedTransactions += amount;
        counts.importedTransactions += 1;
        break;
      case "manualCardTransactions":
        manualCardTransactions += amount;
        counts.manualCardTransactions += 1;
        break;
      case "pendingTransactions":
        pendingTransactions += amount;
        counts.pendingTransactions += 1;
        break;
    }
    breakdown.push({
      id,
      bucket,
      label: e.merchant ?? e.note ?? "חיוב כרטיס",
      amount,
      kind: "entry",
    });
  }

  const totalExpectedCharge =
    futureCardCharges +
    existingInstallments +
    walletTransactions +
    importedTransactions +
    manualCardTransactions +
    pendingTransactions;

  return {
    monthKey: args.monthKey,
    futureCardCharges: Math.round(futureCardCharges),
    existingInstallments: Math.round(existingInstallments),
    walletTransactions: Math.round(walletTransactions),
    importedTransactions: Math.round(importedTransactions),
    manualCardTransactions: Math.round(manualCardTransactions),
    pendingTransactions: Math.round(pendingTransactions),
    totalExpectedCharge: Math.round(totalExpectedCharge),
    counts,
    breakdown,
    duplicatesPrevented,
  };
}
