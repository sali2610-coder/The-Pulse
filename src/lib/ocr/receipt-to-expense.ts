// Phase 221 — bridge parsed receipt → AddExpenseInput shape.
//
// Closes the loop on the OCR pipeline: until now ReceiptScanCard
// parsed text into ReceiptCandidate fields but the user had to
// retype them into the regular expense form. This helper assembles
// the input the store expects, picking the category via the
// existing suggestCategory engine so confidence + reason stay
// consistent with Wallet/SMS confirm sheets.
//
// Pure compute. No store, no React.

import type { CategoryId } from "@/lib/categories";
import type { ExpenseEntry, RecurringRule } from "@/types/finance";
import type { CorrectionRecord } from "@/lib/corrections";
import { suggestCategory } from "@/lib/suggest-category";
import type { ReceiptCandidate } from "@/lib/ocr/parser";

export type ReceiptExpenseDraft = {
  amount: number;
  category: CategoryId;
  merchant: string;
  chargeDate: string;
  installments: 1;
  paymentMethod: "cash" | "credit";
  source: "manual";
  note?: string;
  /** Pass-through of the suggestion confidence so the UI can warn
   *  before adding when only "low" data was available. */
  suggestionConfidence: "high" | "medium" | "low";
  suggestionReason: string;
};

export function buildExpenseFromReceipt(args: {
  candidate: ReceiptCandidate;
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  corrections?: CorrectionRecord[];
  /** Default "credit" — most receipts come from card purchases. The
   *  UI can override before calling. */
  paymentMethod?: "cash" | "credit";
  now?: Date;
}):
  | { ok: true; draft: ReceiptExpenseDraft }
  | { ok: false; reason: "missing_amount" | "non_positive_amount" } {
  const c = args.candidate;
  if (c.amount === undefined) {
    return { ok: false, reason: "missing_amount" };
  }
  if (!Number.isFinite(c.amount) || c.amount <= 0) {
    return { ok: false, reason: "non_positive_amount" };
  }

  const merchant = (c.merchant ?? "").trim() || "קבלה ללא שם";
  const now = args.now ?? new Date();
  // ReceiptCandidate.occurredAt is already ISO when present; fall
  // back to "now" so chargeDate is never empty.
  const chargeDate = c.occurredAt ?? now.toISOString();

  const suggestion = suggestCategory({
    merchant,
    amount: c.amount,
    entries: args.entries,
    rules: args.rules,
    corrections: args.corrections,
  });

  return {
    ok: true,
    draft: {
      amount: c.amount,
      category: suggestion.category,
      merchant,
      chargeDate,
      installments: 1,
      paymentMethod: args.paymentMethod ?? "credit",
      source: "manual",
      note: c.currency && c.currency !== "ILS" ? `[${c.currency}]` : undefined,
      suggestionConfidence: suggestion.confidence,
      suggestionReason: suggestion.reason,
    },
  };
}
