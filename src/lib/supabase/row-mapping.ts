// DB row ↔ in-store entity mapping.
//
// Pure module. No Supabase client, no React. Importable from server
// API routes AND vitest tests. Every function is a 1:1 shape-only
// transform — never silently drops fields, never sets server-owned
// defaults. The owning consumer is responsible for setting `user_id`
// before insert.

import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
} from "@/types/finance";
import type {
  DbAccount,
  DbExpenseEntry,
  DbIncome,
  DbLoan,
  DbRecurringRule,
} from "./types";

// ── ExpenseEntry ────────────────────────────────────────────────────

export function entryToRow(
  e: ExpenseEntry,
  userId: string,
): Omit<DbExpenseEntry, "updated_at"> {
  return {
    id: e.id,
    user_id: userId,
    amount: e.amount,
    category: e.category,
    note: e.note ?? null,
    source: e.source,
    payment_method: e.paymentMethod,
    installments: e.installments,
    charge_date: e.chargeDate,
    created_at: e.createdAt,
    matched_rule_id: e.matchedRuleId ?? null,
    external_id: e.externalId ?? null,
    issuer: e.issuer ?? null,
    card_last4: e.cardLast4 ?? null,
    merchant: e.merchant ?? null,
    is_refund: e.isRefund ?? null,
    currency: e.currency ?? null,
    bank_pending: e.bankPending ?? null,
    needs_confirmation: e.needsConfirmation ?? null,
    confirmed_at: e.confirmedAt ?? null,
    account_id: e.accountId ?? null,
    exclude_from_budget: e.excludeFromBudget ?? null,
    raw_notification_body: e.rawNotificationBody ?? null,
  };
}

export function rowToEntry(r: DbExpenseEntry): ExpenseEntry {
  return {
    id: r.id,
    amount: Number(r.amount),
    category: r.category as ExpenseEntry["category"],
    note: r.note ?? undefined,
    source: r.source as ExpenseEntry["source"],
    paymentMethod: r.payment_method,
    installments: r.installments,
    chargeDate: r.charge_date,
    createdAt: r.created_at,
    matchedRuleId: r.matched_rule_id ?? undefined,
    externalId: r.external_id ?? undefined,
    issuer: r.issuer ? (r.issuer as ExpenseEntry["issuer"]) : undefined,
    cardLast4: r.card_last4 ?? undefined,
    merchant: r.merchant ?? undefined,
    isRefund: r.is_refund ?? undefined,
    currency: r.currency
      ? (r.currency as ExpenseEntry["currency"])
      : undefined,
    bankPending: r.bank_pending ?? undefined,
    needsConfirmation: r.needs_confirmation ?? undefined,
    confirmedAt: r.confirmed_at ?? undefined,
    accountId: r.account_id ?? undefined,
    excludeFromBudget: r.exclude_from_budget ?? undefined,
    rawNotificationBody: r.raw_notification_body ?? undefined,
  };
}

// ── Account ─────────────────────────────────────────────────────────

export function accountToRow(
  a: Account,
  userId: string,
): Omit<DbAccount, "updated_at" | "created_at"> & {
  created_at?: string;
} {
  return {
    id: a.id,
    user_id: userId,
    kind: a.kind,
    label: a.label,
    issuer: a.issuer ?? null,
    card_last4: a.cardLast4 ?? null,
    anchor_balance: a.anchorBalance ?? null,
    anchor_updated_at: a.anchorUpdatedAt ?? null,
    active: a.active,
    billing_day: a.billingDay ?? null,
    payment_day: a.paymentDay ?? null,
    credit_limit: a.creditLimit ?? null,
    current_debt: a.currentDebt ?? null,
    color: a.color ?? null,
    created_at: a.createdAt,
  };
}

export function rowToAccount(r: DbAccount): Account {
  return {
    id: r.id,
    kind: r.kind,
    label: r.label,
    issuer: r.issuer ? (r.issuer as Account["issuer"]) : undefined,
    cardLast4: r.card_last4 ?? undefined,
    anchorBalance:
      r.anchor_balance === null ? undefined : Number(r.anchor_balance),
    anchorUpdatedAt: r.anchor_updated_at ?? undefined,
    active: r.active,
    billingDay: r.billing_day ?? undefined,
    paymentDay: r.payment_day ?? undefined,
    creditLimit:
      r.credit_limit === null ? undefined : Number(r.credit_limit),
    currentDebt:
      r.current_debt === null ? undefined : Number(r.current_debt),
    color: r.color ?? undefined,
    createdAt: r.created_at,
  };
}

// ── RecurringRule ───────────────────────────────────────────────────

export function ruleToRow(
  r: RecurringRule,
  userId: string,
): Omit<DbRecurringRule, "updated_at" | "created_at"> & {
  created_at?: string;
} {
  return {
    id: r.id,
    user_id: userId,
    label: r.label,
    category: r.category,
    estimated_amount: r.estimatedAmount,
    day_of_month: r.dayOfMonth,
    keywords: r.keywords,
    active: r.active,
    installment_total: r.installmentTotal ?? null,
    start_month: r.startMonth ?? null,
    start_year: r.startYear ?? null,
    payment_source: r.paymentSource ?? null,
    linked_card_id: r.linkedCardId ?? null,
    created_at: r.createdAt,
  };
}

export function rowToRule(r: DbRecurringRule): RecurringRule {
  return {
    id: r.id,
    label: r.label,
    category: r.category as RecurringRule["category"],
    estimatedAmount: Number(r.estimated_amount),
    dayOfMonth: r.day_of_month,
    keywords: r.keywords ?? [],
    active: r.active,
    createdAt: r.created_at,
    installmentTotal: r.installment_total ?? undefined,
    startMonth: r.start_month ?? undefined,
    startYear: r.start_year ?? undefined,
    paymentSource: r.payment_source
      ? (r.payment_source as RecurringRule["paymentSource"])
      : undefined,
    linkedCardId: r.linked_card_id ?? undefined,
  };
}

// ── Loan ────────────────────────────────────────────────────────────

export function loanToRow(
  l: Loan,
  userId: string,
): Omit<DbLoan, "updated_at" | "created_at"> & { created_at?: string } {
  return {
    id: l.id,
    user_id: userId,
    label: l.label,
    monthly_installment: l.monthlyInstallment,
    day_of_month: l.dayOfMonth,
    start_month: l.startMonth ?? null,
    start_year: l.startYear ?? null,
    total_payments: l.totalPayments ?? null,
    end_date: l.endDate ?? null,
    remaining_balance: l.remainingBalance ?? null,
    active: l.active,
    created_at: l.createdAt,
  };
}

export function rowToLoan(r: DbLoan): Loan {
  return {
    id: r.id,
    label: r.label,
    monthlyInstallment: Number(r.monthly_installment),
    dayOfMonth: r.day_of_month,
    startMonth: r.start_month ?? undefined,
    startYear: r.start_year ?? undefined,
    totalPayments: r.total_payments ?? undefined,
    endDate: r.end_date ?? undefined,
    remainingBalance:
      r.remaining_balance === null ? undefined : Number(r.remaining_balance),
    active: r.active,
    createdAt: r.created_at,
  };
}

// ── Income ──────────────────────────────────────────────────────────

export function incomeToRow(
  i: Income,
  userId: string,
): Omit<DbIncome, "updated_at" | "created_at"> & { created_at?: string } {
  return {
    id: i.id,
    user_id: userId,
    label: i.label,
    amount: i.amount,
    day_of_month: i.dayOfMonth,
    active: i.active,
    created_at: i.createdAt,
  };
}

export function rowToIncome(r: DbIncome): Income {
  return {
    id: r.id,
    label: r.label,
    amount: Number(r.amount),
    dayOfMonth: r.day_of_month,
    active: r.active,
    createdAt: r.created_at,
  };
}
