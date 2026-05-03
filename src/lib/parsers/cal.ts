import {
  extractAmount,
  extractCardLast4,
  extractDateDDMMYY,
  extractMerchant,
  detectsApplePay,
  detectsRefund,
  detectsPending,
  detectsForeignCurrency,
} from "./helpers";
import type { Currency } from "@/types/finance";

export type CalParseResult = {
  amount: number;
  cardLast4: string;
  merchant: string;
  occurredAt: string;
  applePay: boolean;
  isRefund: boolean;
  pending: boolean;
  currency: Currency;
};

export type CalParseFailure = {
  ok: false;
  reason: string;
  missing: string[];
};

export type CalParseOk = {
  ok: true;
  result: CalParseResult;
};

/**
 * Parses a Cal (Cal-Online / "כאל") credit-card SMS. Sample we support:
 *   "לקוח יקר, בוצעה עסקה בכרטיסך המסתיימת ב-1234 בבית עסק 'שופרסל'
 *    בסכום 150.50 ש"ח בתאריך 03/05/26."
 *
 * Returns a typed failure when any required field cannot be extracted, so the
 * webhook can log a diagnostic and still ack 200.
 */
export function parseCal(smsBody: string): CalParseOk | CalParseFailure {
  const text = smsBody.replace(/\s+/g, " ").trim();
  const amount = extractAmount(text);
  const cardLast4 = extractCardLast4(text);
  const merchant = extractMerchant(text);
  const occurredAt = extractDateDDMMYY(text) ?? new Date().toISOString();

  const missing: string[] = [];
  if (amount === null) missing.push("amount");
  if (!cardLast4) missing.push("cardLast4");
  if (!merchant) missing.push("merchant");

  if (amount === null || !cardLast4 || !merchant) {
    return { ok: false, reason: "incomplete_cal_sms", missing };
  }

  const fx = detectsForeignCurrency(text);
  return {
    ok: true,
    result: {
      amount,
      cardLast4,
      merchant,
      occurredAt,
      applePay: detectsApplePay(text),
      isRefund: detectsRefund(text),
      pending: detectsPending(text),
      currency: fx ?? "ILS",
    },
  };
}
