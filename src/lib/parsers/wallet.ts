import {
  detectsApplePay,
  detectsForeignCurrency,
  detectsPending,
  detectsRefund,
  extractAmount as extractAmountWithPrefix,
  extractCardLast4,
  extractMerchant,
} from "./helpers";
import type { Currency } from "@/types/finance";

// ────────────────────────────────────────────────────────────────────────────
// Wallet notification parser.
//
// iOS Wallet / Apple Pay notifications use a much looser format than bank
// SMS. We see things like:
//
//   "Apple Pay  ·  Shufersal  ·  ₪42.90"
//   "תשלום באפל פיי, שופרסל, 42.90 ש״ח"
//   "$12.40 charged at Cofix"
//   "Visa ····1234  Cofix  42.90 ILS"
//
// Required field: `amount`. Everything else (merchant, cardLast4) is
// best-effort — the webhook still persists the row with `needsConfirmation:
// true` so the user can review later.
// ────────────────────────────────────────────────────────────────────────────

/** Looser amount regex than the SMS one. Captures a currency-prefixed or
 *  -suffixed number anywhere in the body. Tries `₪`/`$`/`€`/`£`/`ILS`/`NIS`
 *  /`USD`/`EUR`/`GBP` plus the Hebrew ש"ח variants. */
const AMOUNT_RE_LOOSE = new RegExp(
  // currency-prefixed: ₪42.90, $12, €5,300.00
  `(?:[₪$€£]\\s*([\\d,]+(?:\\.\\d{1,2})?))` +
    // OR amount followed by currency token
    `|(?:([\\d,]+(?:\\.\\d{1,2})?)\\s*(?:ש["'׳״]?ח|NIS|ILS|USD|EUR|GBP|\\$|€|£|₪))`,
  "u",
);

function extractAmountLoose(text: string): number | null {
  // Prefer the SMS-style "בסכום ... ש"ח" prefix when present — it's stricter
  // and won't accidentally match a card number or a phone fragment.
  const strict = extractAmountWithPrefix(text);
  if (strict !== null) return strict;
  const m = text.match(AMOUNT_RE_LOOSE);
  if (!m) return null;
  const raw = m[1] ?? m[2];
  if (!raw) return null;
  const num = Number(raw.replace(/,/g, ""));
  return Number.isFinite(num) && num > 0 ? num : null;
}

/** Card last-4 in Wallet copy often looks like "····1234" or "...1234"
 *  rather than the Hebrew SMS phrasing. Try both. */
const CARD_RE_WALLET = /(?:····|••••|\.\.\.\.|\.\.\.)\s*(\d{4})\b/;

function extractCardLast4Wallet(text: string): string | undefined {
  const m = text.match(CARD_RE_WALLET);
  if (m) return m[1];
  return extractCardLast4(text) ?? undefined;
}

/** Wallet bodies often use "·" or "," as separators with merchant in the
 *  middle slot. Pull the longest non-numeric token between separators as a
 *  best-effort merchant. */
function extractMerchantWallet(title: string, body: string): string | undefined {
  // First, see if the SMS-style "בית עסק" phrasing happens to match.
  const fromHelper = extractMerchant(`${title} ${body}`);
  if (fromHelper) return fromHelper;

  const segments = `${title} · ${body}`
    .split(/[·,•|\n]+/u)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !/^(Apple Pay|אפל\s*פיי|Visa|Mastercard|Amex|כרטיס)\s*/iu.test(s));

  // Drop pure currency/amount segments.
  const candidates = segments.filter((s) => {
    const stripped = s.replace(/[₪$€£]|ש["'׳״]?ח|NIS|ILS|USD|EUR|GBP/giu, "").trim();
    if (!stripped) return false;
    return !/^[\d.,\s-]+$/.test(stripped);
  });

  if (candidates.length === 0) return undefined;
  // Prefer the longest candidate that has at least one letter.
  const letterful = candidates.filter((s) => /[\p{L}]/u.test(s));
  const pool = letterful.length > 0 ? letterful : candidates;
  pool.sort((a, b) => b.length - a.length);
  return pool[0];
}

export type WalletParseResult = {
  amount: number;
  merchant?: string;
  cardLast4?: string;
  applePay: boolean;
  isRefund: boolean;
  bankPending: boolean;
  currency: Currency;
  occurredAt: string;
};

export type WalletParseFailure = {
  ok: false;
  reason: "incomplete_wallet_notification";
  missing: string[];
};

export type WalletParseOk = { ok: true; result: WalletParseResult };

/** Best-effort parse of an iOS Wallet notification. Only `amount` is
 *  required; missing merchant / cardLast4 are fine — the webhook still
 *  persists with `needsConfirmation: true`. */
export function parseWalletNotification(input: {
  title: string;
  body: string;
  receivedAt?: number;
}): WalletParseOk | WalletParseFailure {
  const title = (input.title ?? "").replace(/\s+/g, " ").trim();
  const body = (input.body ?? "").replace(/\s+/g, " ").trim();
  const text = `${title} ${body}`.trim();

  const amount = extractAmountLoose(text);
  if (amount === null) {
    return {
      ok: false,
      reason: "incomplete_wallet_notification",
      missing: ["amount"],
    };
  }

  const fx = detectsForeignCurrency(text);
  const occurredAt = input.receivedAt
    ? new Date(input.receivedAt).toISOString()
    : new Date().toISOString();

  return {
    ok: true,
    result: {
      amount,
      merchant: extractMerchantWallet(title, body),
      cardLast4: extractCardLast4Wallet(text),
      applePay: detectsApplePay(text),
      isRefund: detectsRefund(text),
      bankPending: detectsPending(text),
      currency: fx ?? "ILS",
      occurredAt,
    },
  };
}
