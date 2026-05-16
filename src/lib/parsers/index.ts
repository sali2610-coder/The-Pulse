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

  // Supermarkets / groceries (Hebrew + English variants — Wallet payloads
  // often arrive in English).
  if (
    /(שופר|רמי לוי|ויקטורי|אושר|טיב טעם|יוחננוף|מגה|shufersal|rami\s*levy|victory|tiv\s*ta|yochananof|mega|grocer|supermarket)/i.test(
      m,
    )
  ) {
    return "food";
  }
  // Coffee shops + restaurants
  if (
    /(מסעדה|בורגר|פיצה|מק\s*דונל|קפה|בית קפה|קופיקס|cofix|aroma|ארומה|cafe|coffee|starbucks|burger|pizza|mcdonald)/i.test(
      m,
    )
  ) {
    return "food";
  }
  if (/(דלק|paz|פז|sonol|סונול|delek|מנטה|תחנת|gas\s*station)/i.test(m)) {
    return "transport";
  }
  if (
    /(rav\s*kav|רב.?קב|cab|taxi|מונית|gett|uber|moovit|hertz)/i.test(m)
  ) {
    return "transport";
  }
  if (
    /(zara|h&m|next|fox|castro|מסטר|amazon|aliexpress|shein|shop|ikea|איקאה|terminal\s*x|נקסט)/i.test(
      m,
    )
  ) {
    return "shopping";
  }
  if (
    /(cinema|yes\s*planet|netflix|spotify|disney|youtube|apple\s*tv|paramount|hbo|פרטנר|סלקום|הוט)/i.test(
      m,
    )
  ) {
    return "entertainment";
  }
  if (
    /(electric|חברת חשמל|water|פלאפון|בזק|hot|partner|cellcom|מים|ועד בית|arnona|ארנונה)/i.test(
      m,
    )
  ) {
    return "bills";
  }
  if (
    /(super\s*pharm|פארם|clalit|מכבי|לאומית|kupat|רוקח|pharmacy|dentist|רופא)/i.test(
      m,
    )
  ) {
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
