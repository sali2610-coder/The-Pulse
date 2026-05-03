// Shared regex helpers for Israeli credit-card SMS parsers.
//
// SMS samples vary slightly between issuers and even between message types
// (regular charge / Apple Pay / installments / FX). Each helper is defensive:
// matches multiple quote variants (ASCII + Hebrew gershayim/geresh + curly),
// dash variants, and tolerates optional whitespace.

const QUOTE_CLASS = `["'׳״“”]`;

export function extractAmount(text: string): number | null {
  // Allow thousands separator (1,234.50) or plain (1234.5).
  // Suffix accepts Hebrew "ש"ח" with various quote forms, "שח", "NIS", "ILS".
  const re =
    /(?:בסכום|ע["״]?ס|סך)\s+([\d,]+(?:\.\d{1,2})?)\s*(?:ש["'׳״]?ח|NIS|ILS)/u;
  const m = text.match(re);
  if (!m) return null;
  const num = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(num) && num > 0 ? num : null;
}

export function extractCardLast4(text: string): string | null {
  // Hebrew final-mem (ם) appears at word-end ("מסתיים"), regular mem (מ)
  // appears mid-word with suffix ("מסתיימת"/"מסתיימה"). Both are valid.
  // Variants: "המסתיימת ב-1234", "מסתיים ב 1234", "מסתיים ב-5678".
  const re = /מסתיי(?:ם|מ[הת]?)\s*ב[\s\-־]*(\d{4})/u;
  const m = text.match(re);
  return m ? m[1] : null;
}

export function extractMerchant(text: string): string | null {
  // Prefer quoted merchant name: "בבית עסק '<name>'".
  const quoted = new RegExp(
    `(?:בית\\s*עסק|בעסק)\\s*${QUOTE_CLASS}([^"'׳״“”]+)${QUOTE_CLASS}`,
    "u",
  );
  const m = text.match(quoted);
  if (m) return m[1].trim();

  // Fallback: unquoted merchant — capture printable run after "בית עסק ".
  const fallback =
    /(?:בית\s*עסק|בעסק)\s+([֐-׿A-Za-z0-9 .'\-]{2,40})/u;
  const f = text.match(fallback);
  return f ? f[1].trim() : null;
}

export function extractDateDDMMYY(text: string): string | null {
  const m = text.match(/בתאריך\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/u);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (
    !Number.isInteger(day) ||
    day < 1 ||
    day > 31 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    !Number.isInteger(year)
  ) {
    return null;
  }
  // Build at noon UTC to avoid TZ rollover near midnight.
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return d.toISOString();
}

export function detectsApplePay(text: string): boolean {
  return /APPLE\s*PAY|אפל\s*פיי/iu.test(text);
}

/**
 * Refunds appear in Israeli SMS as "זיכוי", "החזר", or "Credit". They should
 * land in the store with a positive amount + isRefund=true so the projection
 * layer can subtract them. Hebrew letters aren't ASCII word chars, so `\b`
 * doesn't work — anchor with start/end/whitespace explicitly.
 */
export function detectsRefund(text: string): boolean {
  if (/(^|\s)(זיכוי|החזר)(\s|$)/u.test(text)) return true;
  return /\b(REFUND|CREDIT(?:ED)?)\b/i.test(text);
}

/**
 * Pending SMSes carry "תלוי ועומד" or "ממתין לאישור". Bank hasn't finalized;
 * UI should hold the entry as upcoming, not actual.
 */
export function detectsPending(text: string): boolean {
  if (/(תלוי\s*ו?עומד|ממתין\s*לאישור)/u.test(text)) return true;
  return /\bPENDING\b/i.test(text);
}

const CURRENCY_TOKENS: Array<{ code: "USD" | "EUR" | "GBP" | "OTHER"; re: RegExp }> = [
  { code: "USD", re: /(\$|USD|דולר)/iu },
  { code: "EUR", re: /(€|EUR|אירו|יורו)/iu },
  { code: "GBP", re: /(£|GBP|פאונד)/iu },
];

/**
 * Detects non-ILS currency mentions. Returns the ISO code or null when the
 * message is in shekels.
 */
export function detectsForeignCurrency(text: string):
  | "USD"
  | "EUR"
  | "GBP"
  | "OTHER"
  | null {
  // Shortcut: ש"ח / NIS / ILS — definitely ILS.
  if (/(ש["'׳״]?ח|\bNIS\b|\bILS\b)/iu.test(text)) {
    // ...unless an FX charge ALSO appears (some SMS quote both sides). Then
    // we still flag it as foreign so the budget logic stays honest.
    for (const tok of CURRENCY_TOKENS) {
      if (tok.re.test(text)) return tok.code;
    }
    return null;
  }
  for (const tok of CURRENCY_TOKENS) {
    if (tok.re.test(text)) return tok.code;
  }
  // No currency hint at all: assume ILS by default.
  return null;
}

/**
 * Build a deterministic externalId so retries of the same SMS de-dup at the
 * store. Collision-resistant within a single device (deviceId scoped).
 */
export async function externalIdFor(
  deviceId: string,
  smsBody: string,
): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`${deviceId}|${smsBody}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash).slice(0, 12);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
