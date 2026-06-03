import type { CategoryId } from "@/lib/categories";

export type ExpenseSource = "manual" | "auto" | "sms" | "wallet";
export type PaymentMethod = "cash" | "credit";
/** Card issuer — used for Account.issuer and SMS dispatch. Wallet is not
 *  an issuer; it's a channel (see `ExpenseSource`). */
export type Issuer =
  | "cal"
  | "max"
  | "isracard"
  | "amex"
  | "hapoalim"
  | "leumi"
  | "discount"
  | "mizrahi"
  | "fibi"
  | "visa"
  | "mastercard"
  | "other";
export type Currency = "ILS" | "USD" | "EUR" | "GBP" | "OTHER";
export type AccountKind = "bank" | "card";

export type Account = {
  id: string;
  kind: AccountKind;
  label: string;
  /** Cards only */
  issuer?: Issuer;
  /** Cards only */
  cardLast4?: string;
  /** Banks only — live balance the user types in (may be negative). */
  anchorBalance?: number;
  /** Banks only — last manual update timestamp. */
  anchorUpdatedAt?: string;
  active: boolean;
  createdAt: string;
  /** Phase 90 — cards only: day-of-month the issuer closes the billing
   *  cycle (e.g. 25 → charges Sep 25 → Oct 25 land on the next bill). */
  billingDay?: number;
  /** Phase 90 — cards only: day-of-month the bank debits the user. */
  paymentDay?: number;
  /** Phase 90 — cards only: optional credit limit (₪). */
  creditLimit?: number;
  /** Phase 90 — cards only: optional current debt (₪) the user tracks
   *  manually. Independent of computed pressure — purely informational. */
  currentDebt?: number;
  /** Phase 90 — cards only: hex color so the card surfaces visually
   *  in lists / drilldowns. Defaults to a neutral if absent. */
  color?: string;
};

export type Loan = {
  id: string;
  label: string;
  monthlyInstallment: number;
  /** 1-31; when it auto-debits each month. */
  dayOfMonth: number;
  /** Month (1-12) the loan started billing. v7+. */
  startMonth?: number;
  /** Year the loan started billing. v7+. */
  startYear?: number;
  /** Total number of monthly installments (e.g. 36). v7+. */
  totalPayments?: number;
  /** ISO date — legacy v6 field. New loans use start + totalPayments and
   *  derive end at read time. Kept readable for migration compatibility. */
  endDate?: string;
  /** Legacy v6 field. New loans don't need this — the runtime computes
   *  remaining = totalPayments − paidCount. */
  remainingBalance?: number;
  active: boolean;
  createdAt: string;
};

export type Income = {
  id: string;
  label: string;
  amount: number;
  /** 1-31; expected income day of month. */
  dayOfMonth: number;
  active: boolean;
  createdAt: string;
  /** Phase 316 — per-month actual-received overrides. The base
   *  `amount` is the immutable "expected" baseline; entries here
   *  record what the user reports as actually received in a given
   *  month so the UI can show expected / actual / variance without
   *  ever overwriting the original definition. Key is a MonthKey
   *  ("YYYY-MM"); value is the actual amount. Forecast / liquidity /
   *  cashflow engines still read `amount` so projections continue to
   *  use the expected baseline. */
  actualByMonth?: Record<string, number>;
};

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
   *  pending flag, the existing entry is finalized. Renamed from `pending`
   *  in v6 to disambiguate from user-side `needsConfirmation`. */
  bankPending?: boolean;
  /** User-side: this entry arrived via Wallet with partial data (often
   *  missing merchant or cardLast4) and is awaiting a confirmation sheet.
   *  Excluded from forecast/upcoming math until cleared. */
  needsConfirmation?: boolean;
  /** ISO timestamp the user accepted the confirmation sheet. Cleared
   *  `needsConfirmation` flips false at the same time. */
  confirmedAt?: string;
  /** Raw notification body kept around so the confirmation sheet can
   *  re-parse if the user wants to retry merchant extraction. */
  rawNotificationBody?: string;
  /** Multi-account: which Account this entry is bound to. Optional for
   *  legacy entries; resolution falls back to (issuer + cardLast4). */
  accountId?: string;
  /** User opt-out: when true the entry is preserved in history but
   *  excluded from monthly budget totals + actualSpentThisMonth. Used
   *  for one-off reimbursable items or test rows the user wants to
   *  track but not count. */
  excludeFromBudget?: boolean;
  /** Phase 348 — entry classification. "expense" (default) covers
   *  every legacy entry; "withdrawal" tags ATM / Bit / PayBox /
   *  bank-transfer / savings movements so reports can split "spent"
   *  from "moved between accounts". The bank still sees the cash
   *  leave, but the user-facing language is different. */
  transactionType?: TransactionType;
  /** Phase 348 — withdrawal sub-classification (only meaningful when
   *  transactionType === "withdrawal"). */
  withdrawalKind?: WithdrawalKind;
  /** Phase 348 — free-form withdrawal destination ("חיסכון" / "אבא"). */
  withdrawalDestination?: string;
};

export type TransactionType = "expense" | "withdrawal";
export type WithdrawalKind =
  | "cash"
  | "atm"
  | "transfer"
  | "bit"
  | "paybox"
  | "business"
  | "owner"
  | "investment"
  | "savings"
  | "other";

/** Recurring outflow. Two flavours share this shape:
 *
 *  - **Regular**: ongoing monthly bill (electricity, rent, phone). No
 *    `installmentTotal`. Active indefinitely until the user disables it.
 *  - **Installment**: a finite-length plan (12-month TV purchase, 36-month
 *    appliance plan). `installmentTotal` + `startMonth` + `startYear`
 *    drive auto-progression — the rule retires itself the month after the
 *    last payment.
 *
 *  Both modes use the same `dayOfMonth` for the charge day. */
export type RecurringRule = {
  id: string;
  label: string;
  category: CategoryId;
  estimatedAmount: number;
  dayOfMonth: number;
  keywords: string[];
  active: boolean;
  createdAt: string;
  /** Installment mode only — total number of monthly payments. Undefined
   *  for regular recurring bills. */
  installmentTotal?: number;
  /** Installment mode only — calendar month (1-12) of the first payment. */
  startMonth?: number;
  /** Installment mode only — calendar year of the first payment. */
  startYear?: number;
  /** v7+: how the rule is actually paid in the real world. Drives
   *  card-pressure analytics + future billing-cycle math. Defaults
   *  on migration to "unknown" so existing rules keep working
   *  unchanged. */
  paymentSource?: PaymentSource;
  /** v7+: when paymentSource === "card", the Account.id of the
   *  credit card. Optional — undefined means "card but unspecified". */
  linkedCardId?: string;
  /** v9+: marks a regular monthly bill whose amount fluctuates
   *  (electricity, water, gas). Card-pressure breakdown reports
   *  fixed vs variable separately so the user can see which slice
   *  of their card burden is predictable. Installment-mode rules
   *  ignore this flag (their amount is by definition fixed per
   *  plan). Undefined → treat as fixed. */
  variable?: boolean;
};

export type PaymentSource = "bank" | "card" | "cash" | "unknown";

export type RecurringStatus = {
  ruleId: string;
  monthKey: string;
  status: "pending" | "paid";
  matchedExpenseId?: string;
  actualAmount?: number;
};

export type MonthKey = string;
