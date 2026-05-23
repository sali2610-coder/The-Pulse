// Receipt-text → structured-fields heuristic.
//
// Runs over the raw text any OCR provider returns and pulls out the
// fields a manual expense entry needs:
//   - amount  (₪ / ש"ח / ILS / NIS / numeric-looking total)
//   - merchant (top-of-receipt brand line, run through the same
//     sanitizeMerchant the SMS pipeline uses so brand canonicals match)
//   - occurredAt (DD/MM/YYYY or DD.MM.YYYY found anywhere in the text)
//   - currency  (defaults to ILS; flips on USD/EUR/GBP markers)
//
// Pure. No store access. Safe to call from server, client, or worker.

import { sanitizeMerchant } from "@/lib/sanitize";

export type ReceiptCandidate = {
  amount?: number;
  merchant?: string;
  occurredAt?: string;
  currency?: "ILS" | "USD" | "EUR" | "GBP";
  /** True when the parser is at least 60% sure the text really is a
   *  receipt (has both a recognised amount AND something merchant-like).
   *  The UI uses this to decide whether to pre-fill or prompt. */
  confident: boolean;
};

// Quote variants used in "ש"ח" — covers ASCII ", apostrophe, Hebrew
// geresh (׳), Hebrew gershayim (״) and curly quotes.
const Q = `["'׳״“”]`;

const AMOUNT_PATTERNS: RegExp[] = [
  // "סה״כ 142.90 ש"ח" — most common receipt total marker. Tolerates an
  // optional currency glyph between the label and the number ($, ₪, £…).
  new RegExp(
    `(?:סה${Q}?כ|סך הכל|total|TOTAL|לתשלום)\\s*[:\\-]?\\s*[$₪€£]?\\s*([\\d,]+(?:\\.\\d{1,2})?)`,
    "u",
  ),
  // "₪42.90" / "ILS 42.90" / "$42.10"
  /(?:₪|ILS|NIS|\$|€|£)\s*([\d,]+(?:\.\d{1,2})?)/u,
  // "42.90 ש"ח" — number first, currency after.
  new RegExp(`([\\d,]+(?:\\.\\d{1,2})?)\\s*(?:₪|ש${Q}?ח|ILS|NIS)`, "u"),
];

const FX_MARKERS: Record<string, ReceiptCandidate["currency"]> = {
  USD: "USD",
  $: "USD",
  EUR: "EUR",
  "€": "EUR",
  GBP: "GBP",
  "£": "GBP",
};

const DATE_PATTERN = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/;

export function parseReceiptText(text: string): ReceiptCandidate {
  const trimmed = text.trim();
  if (!trimmed) return { confident: false };

  const amount = extractAmount(trimmed);
  const merchant = extractMerchant(trimmed);
  const occurredAt = extractDate(trimmed);
  const currency = extractCurrency(trimmed);

  const confident = amount !== undefined && merchant !== undefined;

  return {
    ...(amount !== undefined ? { amount } : {}),
    ...(merchant ? { merchant } : {}),
    ...(occurredAt ? { occurredAt } : {}),
    ...(currency ? { currency } : {}),
    confident,
  };
}

function extractAmount(text: string): number | undefined {
  for (const pat of AMOUNT_PATTERNS) {
    const m = text.match(pat);
    if (!m) continue;
    const n = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100;
  }
  return undefined;
}

function extractMerchant(text: string): string | undefined {
  // Treat the first non-empty line that is mostly letters (not all
  // digits / not a header keyword) as the merchant candidate. Receipts
  // print the brand at the top.
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (/^[\d\s,./\-:]+$/.test(line)) continue; // pure numeric/date row
    if (/^(?:חשבונית|קבלה|invoice|receipt|תאריך|date)/i.test(line)) continue;
    if (line.length > 60) continue; // bottom small-print
    const cleaned = sanitizeMerchant(line);
    if (cleaned && cleaned.length >= 2) return cleaned;
  }
  return undefined;
}

function extractDate(text: string): string | undefined {
  const m = text.match(DATE_PATTERN);
  if (!m) return undefined;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  let yy = Number(m[3]);
  if (yy < 100) yy += 2000;
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12 || yy < 2000 || yy > 2100) {
    return undefined;
  }
  const iso = new Date(Date.UTC(yy, mm - 1, dd, 12, 0, 0));
  if (Number.isNaN(iso.getTime())) return undefined;
  return iso.toISOString();
}

function extractCurrency(text: string): ReceiptCandidate["currency"] {
  for (const [marker, code] of Object.entries(FX_MARKERS)) {
    if (text.includes(marker)) return code;
  }
  if (new RegExp(`₪|ש${Q}?ח|ILS|NIS`, "u").test(text)) return "ILS";
  return undefined;
}
