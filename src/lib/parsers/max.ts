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

export type MaxParseResult = {
  amount: number;
  cardLast4: string;
  merchant: string;
  occurredAt: string;
  applePay: boolean;
  isRefund: boolean;
  pending: boolean;
  currency: Currency;
};

type MaxParseFailure = { ok: false; reason: string; missing: string[] };
type MaxParseOk = { ok: true; result: MaxParseResult };

/**
 * Parses a Max ("מקס", formerly Leumi Card) credit-card SMS. Sample:
 *   "הודעה ממקס: בוצעה עסקה ב-APPLE PAY בבית עסק 'דלק' בסכום 200 ש"ח
 *    בכרטיס שמספרו מסתיים ב-5678."
 *
 * Max often omits an explicit date in the body — we fall back to "now",
 * which is accurate to within seconds because the SMS is delivered live.
 */
export function parseMax(smsBody: string): MaxParseOk | MaxParseFailure {
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
    return { ok: false, reason: "incomplete_max_sms", missing };
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
