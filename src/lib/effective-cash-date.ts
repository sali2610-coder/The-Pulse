// Phase 207 — purchase date → effective cash-debit date.
//
// The existing financial engine treats every charge slice as if it
// hits the bank account immediately. Reality:
//
//   * Cash / bank transfer  → hits the account on the charge date.
//   * Credit card           → hits the account on the LINKED CARD's
//                             billing/payment day in the cycle the
//                             slice belongs to.
//   * Installments on card  → each slice rolls forward by one month
//                             AND maps to the card's payment day in
//                             that month.
//
// Pure module. Adds a NEW lens that future cards (safe-to-spend,
// liquidity timeline) read. EXISTING engine modules (projections,
// forecast, card-pressure) stay on their current math — no
// behavior drift for cards that already shipped.
//
// Card-cycle rule of thumb (Israeli credit cards):
//   * billingDay   → end of the statement period.
//   * paymentDay   → when the bank actually debits the user.
//   * A purchase between billingDay of month N and billingDay of N+1
//     debits on paymentDay of N+1 (or N+2 if paymentDay <= billingDay).
//
// We use paymentDay (preferred), then fall back to billingDay, then
// to a 10-day default if the card hasn't been configured. This way
// uncalibrated cards still produce a usable estimate.

import type {
  Account,
  ExpenseEntry,
  PaymentMethod,
  RecurringRule,
} from "@/types/finance";
import {
  installmentProgress,
} from "@/lib/projections";

export type CashImpactKind = "cash" | "bank" | "card";

export type CashImpact = {
  /** The slice index inside the entry (0-based). For one-shot
   *  charges this is always 0. */
  sliceIndex: number;
  /** Original purchase date for the slice (calendar slice date). */
  purchaseDate: Date;
  /** When the slice actually debits the user's bank account. */
  effectiveCashDate: Date;
  /** ₪ debited. Mirrors slice amount. */
  amount: number;
  kind: CashImpactKind;
  /** Reason the date was chosen — useful for explain-sheets. */
  reason: string;
  /** Account.id of the card whose cycle determined the date, when
   *  applicable. Undefined for cash/bank. */
  viaCardId?: string;
};

const DEFAULT_PAYMENT_DAY = 10;

export function effectiveCashImpacts(args: {
  entry: ExpenseEntry;
  accounts: Account[];
  /** Phase 400 — optional rules let findCard honor a matched rule's
   *  linkedCardId override. Without this, the curve uses the entry's
   *  stale accountId and lands on the wrong card's paymentDay. */
  rules?: RecurringRule[];
  now?: Date;
}): CashImpact[] {
  const out: CashImpact[] = [];
  if (args.entry.isRefund) return out; // refunds — out of scope today
  // Phase 402 — Wallet partials (needsConfirmation=true, no
  // confirmedAt) ALSO appear on the curve. The Wallet push fires
  // because Apple Pay genuinely charged the card; the "confirmation"
  // gate is user-side review, not bank-side reality. Curve must
  // anticipate the debit on the card's paymentDay.
  //
  // The Phase 397 budget-side filter (isBudgetExpense) still
  // excludes unconfirmed wallet entries from the donut / categories
  // so the budget vs spent math is unaffected. Only the cash-flow
  // path (which mirrors the bank's eventual reality) sees them.
  //
  // Refund + excludeFromBudget remain hard excludes.
  if (args.entry.excludeFromBudget) return out;

  const totalInstallments = Math.max(1, args.entry.installments);
  const start = new Date(args.entry.chargeDate);
  if (Number.isNaN(start.getTime())) return out;

  const kind: CashImpactKind = resolveKind({
    paymentMethod: args.entry.paymentMethod,
  });
  const card =
    kind === "card" ? findCard(args.accounts, args.entry, args.rules) : null;

  const sliceAmount =
    totalInstallments > 1
      ? args.entry.amount / totalInstallments
      : args.entry.amount;

  for (let i = 0; i < totalInstallments; i++) {
    const purchase = sliceCalendarDate(start, i);
    const effective =
      kind === "card"
        ? cardPaymentDateFor(card, purchase)
        : purchase;
    const reason =
      kind === "card"
        ? card
          ? `יום חיוב הכרטיס ${cardLabel(card)} (${
              card.paymentDay ?? card.billingDay ?? DEFAULT_PAYMENT_DAY
            } בכל חודש)`
          : `ברירת מחדל ליום חיוב כרטיס (${DEFAULT_PAYMENT_DAY})`
        : "חיוב מיידי לחשבון";
    out.push({
      sliceIndex: i,
      purchaseDate: purchase,
      effectiveCashDate: effective,
      amount: roundCents(sliceAmount),
      kind,
      reason,
      viaCardId: card?.id,
    });
  }
  return out;
}

/** Convenience helper for callers walking many entries — flattens
 *  all impacts into one sorted list, oldest effective-date first. */
export function effectiveCashImpactStream(args: {
  entries: ExpenseEntry[];
  accounts: Account[];
  /** Phase 400 — propagate rules so per-entry findCard can honor a
   *  matched rule's linkedCardId. */
  rules?: RecurringRule[];
  now?: Date;
}): CashImpact[] {
  const all: CashImpact[] = [];
  for (const entry of args.entries) {
    for (const impact of effectiveCashImpacts({
      entry,
      accounts: args.accounts,
      rules: args.rules,
      now: args.now,
    })) {
      all.push(impact);
    }
  }
  all.sort(
    (a, b) => a.effectiveCashDate.getTime() - b.effectiveCashDate.getTime(),
  );
  return all;
}

/** Helper for tests / consumers that just want to know "how many
 *  installment slices remain for this entry, and when each lands". */
export function remainingCashImpacts(args: {
  entry: ExpenseEntry;
  accounts: Account[];
  now?: Date;
}): CashImpact[] {
  const now = args.now ?? new Date();
  return effectiveCashImpacts(args).filter(
    (i) => i.effectiveCashDate.getTime() > now.getTime(),
  );
}

/** Helper used by forecasts: how many slices remain on a multi-
 *  installment plan beyond `now`. Mirrors installmentProgress() but
 *  scoped to effective cash dates. */
export function remainingInstallmentCount(args: {
  entry: ExpenseEntry;
  now?: Date;
}): number {
  return installmentProgress(args.entry, args.now ?? new Date()).remaining;
}

function resolveKind(args: { paymentMethod: PaymentMethod }): CashImpactKind {
  if (args.paymentMethod === "credit") return "card";
  // PaymentMethod is currently "credit" | "cash" — every non-credit
  // settles immediately from the bank account.
  return "cash";
}

function findCard(
  accounts: Account[],
  entry: ExpenseEntry,
  rules?: RecurringRule[],
): Account | null {
  // Phase 400 — rule's linkedCardId overrides entry.accountId for
  // matched entries. Without this, editing a recurring rule's card
  // link in Settings leaves the legacy entry pointing at the old
  // card, and the Time-curve cash impact lands on the WRONG card's
  // paymentDay.
  if (entry.matchedRuleId && rules) {
    const rule = rules.find((r) => r.id === entry.matchedRuleId);
    if (rule && rule.linkedCardId) {
      const isCardSettled =
        rule.paymentSource === "card" ||
        (rule.paymentSource !== "bank" && rule.paymentSource !== "cash");
      if (isCardSettled) {
        const matched = accounts.find(
          (a) => a.id === rule.linkedCardId && a.kind === "card",
        );
        if (matched) return matched;
      }
    }
  }
  if (entry.accountId) {
    const matched = accounts.find(
      (a) => a.id === entry.accountId && a.kind === "card",
    );
    if (matched) return matched;
  }
  if (entry.cardLast4) {
    const matched = accounts.find(
      (a) => a.kind === "card" && a.cardLast4 === entry.cardLast4,
    );
    if (matched) return matched;
  }
  // Any active card → fall back to the first. Better than "today"
  // because uncalibrated cards still produce a deferred estimate.
  const first = accounts.find((a) => a.kind === "card" && a.active);
  return first ?? null;
}

function cardLabel(card: Account): string {
  return card.label || `····${card.cardLast4 ?? ""}`;
}

function cardPaymentDateFor(
  card: Account | null,
  purchase: Date,
): Date {
  const paymentDay = clampDay(
    card?.paymentDay ?? card?.billingDay ?? DEFAULT_PAYMENT_DAY,
  );
  const purchaseDay = purchase.getDate();
  const year = purchase.getFullYear();
  const month = purchase.getMonth();

  // If the purchase happened on/before the payment day in its own
  // month, it still lands on this month's payment day (e.g. buy on
  // the 3rd, pay on the 10th).
  // Otherwise it rolls to next month's payment day (e.g. buy on the
  // 20th when payment is the 10th → next month's 10th).
  const sameMonthPay = purchaseDay <= paymentDay;
  const targetYear = sameMonthPay ? year : month === 11 ? year + 1 : year;
  const targetMonth0 = sameMonthPay ? month : month === 11 ? 0 : month + 1;
  const lastDay = new Date(targetYear, targetMonth0 + 1, 0).getDate();
  const day = Math.min(paymentDay, lastDay);
  return new Date(targetYear, targetMonth0, day, 12, 0, 0);
}

function sliceCalendarDate(start: Date, sliceIndex: number): Date {
  // Match the slice-date math projections.ts uses for installments.
  const startIdx = start.getFullYear() * 12 + start.getMonth();
  const targetIdx = startIdx + sliceIndex;
  const targetY = Math.floor(targetIdx / 12);
  const targetM0 = targetIdx % 12;
  const lastDay = new Date(targetY, targetM0 + 1, 0).getDate();
  const day = Math.min(start.getDate(), lastDay);
  return new Date(targetY, targetM0, day, 12, 0, 0);
}

function clampDay(d: number): number {
  if (!Number.isFinite(d)) return DEFAULT_PAYMENT_DAY;
  return Math.max(1, Math.min(31, Math.floor(d)));
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

// ────────────────────────────────────────────────────────────────────
// Phase 208 — recurring-rule lens
// ────────────────────────────────────────────────────────────────────
//
// When a RecurringRule is paid via a credit card (paymentSource ===
// "card" + linkedCardId), the actual liquidity hit isn't on the
// rule's declared dayOfMonth — it's on the linked card's paymentDay
// in the cycle the rule's day belongs to.
//
// Returns kind: "card" with effectiveCashDate moved to the card's
// payment day, or kind: "cash"/"bank" with effectiveCashDate ===
// ruleDate when not card-linked. This lets the new per-card
// bucketing layer route every rule to the correct future-debit slot.

export type RuleCashImpact = {
  ruleId: string;
  /** Calendar day the rule said it charges (dayOfMonth in target month). */
  ruleDate: Date;
  /** When the bank actually debits. */
  effectiveCashDate: Date;
  amount: number;
  kind: CashImpactKind;
  viaCardId?: string;
};

export function effectiveCashImpactForRule(args: {
  rule: import("@/types/finance").RecurringRule;
  accounts: Account[];
  /** Month to compute the impact for. Format YYYY-MM. */
  monthKey: string;
}): RuleCashImpact | null {
  const [yStr, mStr] = args.monthKey.split("-");
  const year = Number(yStr);
  const month0 = Number(mStr) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(month0)) return null;
  const lastDay = new Date(year, month0 + 1, 0).getDate();
  const day = Math.min(Math.max(1, args.rule.dayOfMonth), lastDay);
  const ruleDate = new Date(year, month0, day, 12, 0, 0);

  // Phase 354 — recognise both explicit paymentSource="card" AND
  // legacy linkedCardId-only rules.
  const isCard =
    args.rule.paymentSource === "card" ||
    (!!args.rule.linkedCardId &&
      args.rule.paymentSource !== "bank" &&
      args.rule.paymentSource !== "cash");
  if (!isCard) {
    return {
      ruleId: args.rule.id,
      ruleDate,
      effectiveCashDate: ruleDate,
      amount: roundCents(args.rule.estimatedAmount),
      kind: args.rule.paymentSource === "cash" ? "cash" : "bank",
    };
  }

  const card =
    args.accounts.find(
      (a) => a.id === args.rule.linkedCardId && a.kind === "card",
    ) ??
    args.accounts.find((a) => a.kind === "card" && a.active) ??
    null;

  return {
    ruleId: args.rule.id,
    ruleDate,
    effectiveCashDate: cardPaymentDateFor(card, ruleDate),
    amount: roundCents(args.rule.estimatedAmount),
    kind: "card",
    viaCardId: card?.id,
  };
}
