import type { CategoryId } from "@/lib/categories";
import type { Currency, Issuer } from "@/types/finance";
import { sanitizeMerchant } from "@/lib/sanitize";
import { parseCal } from "./cal";
import { parseMax } from "./max";

export type ParsedSms = {
  amount: number;
  cardLast4: string;
  merchant: string;
  merchantRaw: string;
  occurredAt: string;
  applePay: boolean;
  isRefund: boolean;
  pending: boolean;
  currency: Currency;
  issuer: Issuer;
  category: CategoryId;
};

export type ParseFailure = {
  ok: false;
  reason: string;
  missing?: string[];
};

export type ParseSuccess = { ok: true; result: ParsedSms };

export function categorize(merchant: string): CategoryId {
  const m = merchant.toLowerCase();
  if (
    /(שופר|רמי לוי|ויקטורי|אושר|טיב טעם|יוחננוף|מגה|grocer|supermarket)/i.test(
      m,
    )
  ) {
    return "food";
  }
  if (/(מסעדה|בורגר|פיצה|cafe|coffee|מק\s*דונל|קפה|בית קפה)/i.test(m)) {
    return "food";
  }
  if (/(דלק|paz|פז|sonol|סונול|delek|מנטה|תחנת)/i.test(m)) return "transport";
  if (/(rav\s*kav|רב.?קב|cab|taxi|מונית|gett|uber)/i.test(m)) return "transport";
  if (/(zara|h&m|next|fox|castro|מסטר|amazon|aliexpress|shein|shop)/i.test(m)) {
    return "shopping";
  }
  if (/(cinema|yes\s*planet|netflix|spotify|hot|partner|cellcom|פרטנר|סלקום)/i.test(m)) {
    return "entertainment";
  }
  if (/(electric|חברת חשמל|water|פלאפון|בזק|hot|partner|cellcom|הוט)/i.test(m)) {
    return "bills";
  }
  if (/(super\s*pharm|פארם|clalit|מכבי|לאומית|kupat|רוקח)/i.test(m)) {
    return "health";
  }
  return "other";
}

export function parseSmsByIssuer(
  issuer: string,
  smsBody: string,
): ParseSuccess | ParseFailure {
  const lower = issuer.toLowerCase();

  const finalize = (
    parsed:
      | ReturnType<typeof parseCal>
      | ReturnType<typeof parseMax>,
    issuerId: Issuer,
  ): ParseSuccess | ParseFailure => {
    if (!parsed.ok) return parsed;
    const cleanMerchant = sanitizeMerchant(parsed.result.merchant);
    return {
      ok: true,
      result: {
        ...parsed.result,
        issuer: issuerId,
        merchant: cleanMerchant,
        merchantRaw: parsed.result.merchant,
        category: categorize(cleanMerchant || parsed.result.merchant),
      },
    };
  };

  if (lower === "cal") return finalize(parseCal(smsBody), "cal");
  if (lower === "max") return finalize(parseMax(smsBody), "max");
  return { ok: false, reason: "unknown_issuer" };
}
