import { describe, expect, it } from "vitest";

import {
  accountToRow,
  entryToRow,
  incomeToRow,
  loanToRow,
  rowToAccount,
  rowToEntry,
  rowToIncome,
  rowToLoan,
  rowToRule,
  ruleToRow,
} from "@/lib/supabase/row-mapping";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
} from "@/types/finance";

const USER = "u-test";

describe("entry mapping", () => {
  it("round-trips an entry with all optional fields populated", () => {
    const e: ExpenseEntry = {
      id: "e1",
      amount: 250,
      category: "food",
      note: "shufersal",
      source: "sms",
      paymentMethod: "credit",
      installments: 3,
      chargeDate: "2026-05-10T10:00:00.000Z",
      createdAt: "2026-05-10T10:00:00.000Z",
      externalId: "ext-1",
      issuer: "cal",
      cardLast4: "1234",
      merchant: "Shufersal",
      isRefund: false,
      currency: "ILS",
      accountId: "acct-1",
    };
    const back = rowToEntry({
      ...entryToRow(e, USER),
      updated_at: "2026-05-10T10:00:00.000Z",
    });
    expect(back).toMatchObject({
      id: "e1",
      amount: 250,
      category: "food",
      source: "sms",
      installments: 3,
      externalId: "ext-1",
      cardLast4: "1234",
      merchant: "Shufersal",
      accountId: "acct-1",
    });
  });

  it("normalizes nullable fields", () => {
    const row = entryToRow(
      {
        id: "e2",
        amount: 10,
        category: "other",
        source: "manual",
        paymentMethod: "cash",
        installments: 1,
        chargeDate: "2026-05-10T10:00:00.000Z",
        createdAt: "2026-05-10T10:00:00.000Z",
      },
      USER,
    );
    expect(row.note).toBeNull();
    expect(row.merchant).toBeNull();
    expect(row.card_last4).toBeNull();
  });
});

describe("account mapping", () => {
  it("round-trips bank + card variants", () => {
    const bank: Account = {
      id: "b1",
      kind: "bank",
      label: "Discount",
      anchorBalance: 1234.56,
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const card: Account = {
      id: "c1",
      kind: "card",
      label: "CAL",
      issuer: "cal",
      cardLast4: "1234",
      billingDay: 25,
      paymentDay: 2,
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect(
      rowToAccount({
        ...accountToRow(bank, USER),
        updated_at: "2026-01-01T00:00:00.000Z",
        created_at: bank.createdAt,
      }),
    ).toMatchObject({ id: "b1", kind: "bank", anchorBalance: 1234.56 });
    expect(
      rowToAccount({
        ...accountToRow(card, USER),
        updated_at: "2026-01-01T00:00:00.000Z",
        created_at: card.createdAt,
      }),
    ).toMatchObject({
      id: "c1",
      kind: "card",
      cardLast4: "1234",
      billingDay: 25,
    });
  });
});

describe("rule mapping", () => {
  it("round-trips card-linked installment plan", () => {
    const r: RecurringRule = {
      id: "r1",
      label: "צמיגים",
      category: "transport",
      estimatedAmount: 400,
      dayOfMonth: 10,
      keywords: ["צמיגים"],
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      installmentTotal: 12,
      startMonth: 1,
      startYear: 2026,
      paymentSource: "card",
      linkedCardId: "c1",
    };
    const back = rowToRule({
      ...ruleToRow(r, USER),
      updated_at: "2026-01-01T00:00:00.000Z",
      created_at: r.createdAt,
    });
    expect(back).toMatchObject({
      id: "r1",
      paymentSource: "card",
      linkedCardId: "c1",
      installmentTotal: 12,
      startMonth: 1,
      startYear: 2026,
    });
  });
});

describe("loan + income mapping", () => {
  it("round-trips loan", () => {
    const l: Loan = {
      id: "l1",
      label: "מכונית",
      monthlyInstallment: 1500,
      dayOfMonth: 5,
      remainingBalance: 45000,
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const back = rowToLoan({
      ...loanToRow(l, USER),
      updated_at: "2026-01-01T00:00:00.000Z",
      created_at: l.createdAt,
    });
    expect(back).toMatchObject({
      id: "l1",
      monthlyInstallment: 1500,
      remainingBalance: 45000,
    });
  });

  it("round-trips income", () => {
    const i: Income = {
      id: "i1",
      label: "שכר",
      amount: 18000,
      dayOfMonth: 1,
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const back = rowToIncome({
      ...incomeToRow(i, USER),
      updated_at: "2026-01-01T00:00:00.000Z",
      created_at: i.createdAt,
    });
    expect(back).toMatchObject({ id: "i1", amount: 18000, dayOfMonth: 1 });
  });
});
