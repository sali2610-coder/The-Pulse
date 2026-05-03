import type { CategoryId } from "@/lib/categories";

export type ExpenseSource = "manual" | "auto";
export type PaymentMethod = "cash" | "credit";
export type Issuer = "cal" | "max";

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
