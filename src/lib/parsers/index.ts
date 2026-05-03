import type { CategoryId } from "@/lib/categories";
import type { Issuer } from "@/types/finance";
import { parseCal } from "./cal";
import { parseMax } from "./max";

export type ParsedSms = {
  amount: number;
  cardLast4: string;
  merchant: string;
  occurredAt: string;
  applePay: boolean;
  issuer: Issuer;
  category: CategoryId;
};

export type ParseFailure = {
  ok: false;
  reason: string;
  missing?: string[];
};

export type ParseSuccess = { ok: true; result: ParsedSms };

function categorize(merchant: string): CategoryId {
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
  if (lower === "cal") {
    const r = parseCal(smsBody);
    if (!r.ok) return r;
    return {
      ok: true,
      result: {
        ...r.result,
        issuer: "cal",
        category: categorize(r.result.merchant),
      },
    };
  }
  if (lower === "max") {
    const r = parseMax(smsBody);
    if (!r.ok) return r;
    return {
      ok: true,
      result: {
        ...r.result,
        issuer: "max",
        category: categorize(r.result.merchant),
      },
    };
  }
  return { ok: false, reason: "unknown_issuer" };
}
