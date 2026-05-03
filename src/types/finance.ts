import type { CategoryId } from "@/lib/categories";

export type ExpenseSource = "manual" | "auto";
export type PaymentMethod = "cash" | "credit";
export type Issuer = "cal" | "max";
export type Currency = "ILS" | "USD" | "EUR" | "GBP" | "OTHER";

export type ExpenseEntry = {
  id: string;
  amount: number;
  category: CategoryId;
  note?: string;
  source: ExpenseSource;
  paymentMethod: PaymentMethod;
  installments: number;
  chargeDate: string;
  createdAt: string;
  matchedRuleId?: string;
  // Auto-ingested fields (from SMS / webhook). Optional for manual entries.
  externalId?: string;
  issuer?: Issuer;
  cardLast4?: string;
  merchant?: string;
  /** Refund / credit-back. Stored with positive amount + this flag so the
   *  projection layer subtracts it from the month total. */
  isRefund?: boolean;
  /** Non-ILS charge. We still record the displayed amount, but projections
   *  exclude it from the budget math (until an FX rate lands). */
  currency?: Currency;
  /** "תלוי ועומד" — bank hasn't finalized the charge yet. Kept out of
   *  `actual`; appears in `upcoming`. Once the SMS replays without the
   *  pending flag, the existing entry is finalized. */
  pending?: boolean;
};

export type RecurringRule = {
  id: string;
  label: string;
  category: CategoryId;
  estimatedAmount: number;
  dayOfMonth: number;
  keywords: string[];
  active: boolean;
  createdAt: string;
};

export type RecurringStatus = {
  ruleId: string;
  monthKey: string;
  status: "pending" | "paid";
  matchedExpenseId?: string;
  actualAmount?: number;
};

export type MonthKey = string;
