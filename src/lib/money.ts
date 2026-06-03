// Phase 341 — money formatting + parsing helpers.
//
// Single source of truth for ILS amounts across the app. Every
// component that displays a currency value should go through
// `formatCurrencyAmount` so the rendering rule stays consistent:
//
//   - Integer amount (e.g. 350)       → "350 ₪"
//   - Has agorot (e.g. 59.9 / 13_000.75) → "59.90 ₪" / "13,000.75 ₪"
//
// Internal math still uses regular `Number` (JS doubles) — the agorot
// helpers `toAgorot` / `fromAgorot` are exposed for CSV round-trips,
// equality comparisons, and future migrations to an integer-money
// representation, but no existing engine is refactored to use them.
//
// All helpers are locale-explicit ("he-IL") so RTL surfaces render
// the thousands separator and decimal point identically.

const NUMERIC_HE = "he-IL" as const;

/** Round a fractional ILS amount to 2 decimal places without leaking
 *  IEEE-754 noise (`0.1 + 0.2 = 0.30000000000000004`). Used by the
 *  parsing path so two ₪10.50 entries sum to ₪21.00. */
export function roundToAgorot(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/** ILS → agorot integer. Useful for equality checks + storage. */
export function toAgorot(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

/** Agorot integer → ILS float. */
export function fromAgorot(agorot: number): number {
  if (!Number.isFinite(agorot)) return 0;
  return agorot / 100;
}

/** Parse a free-form currency input string into a finite ILS value.
 *
 *  Accepts ASCII digits + a single decimal point, strips other
 *  characters (Hebrew letters, comma thousands separators, the ₪
 *  symbol). Returns `undefined` for empty input so RHF can tell apart
 *  "no value" from 0.
 *
 *  Caps to 2 decimals — anything past the second digit after the
 *  point is dropped before the float conversion so the rounding step
 *  doesn't propagate up. */
export function parseCurrencyAmount(input: string): number | undefined {
  if (typeof input !== "string") return undefined;
  // Normalize: strip thousands separators + symbol; keep digits, point.
  const cleaned = input.replace(/[^\d.]/g, "");
  if (!cleaned) return undefined;
  // Allow at most one dot. If user typed multiple, keep the first.
  const firstDot = cleaned.indexOf(".");
  let normalized = cleaned;
  if (firstDot !== -1) {
    const head = cleaned.slice(0, firstDot);
    const tail = cleaned.slice(firstDot + 1).replace(/\./g, "");
    normalized = `${head}.${tail.slice(0, 2)}`;
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return undefined;
  return roundToAgorot(n);
}

const ILS_INT_FMT = new Intl.NumberFormat(NUMERIC_HE, {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const ILS_DEC_FMT = new Intl.NumberFormat(NUMERIC_HE, {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format an ILS amount for display.
 *
 *    formatCurrencyAmount(350)        → "350 ₪"
 *    formatCurrencyAmount(59.9)       → "59.90 ₪"
 *    formatCurrencyAmount(13000.75)   → "13,000.75 ₪"
 *    formatCurrencyAmount(-1250.35)   → "-1,250.35 ₪"
 *
 *  Pass `forceDecimals` when the calling surface always shows two
 *  digits (totals tables, CSV exports). */
export function formatCurrencyAmount(
  value: number,
  options?: { forceDecimals?: boolean },
): string {
  if (!Number.isFinite(value)) return ILS_INT_FMT.format(0);
  const rounded = roundToAgorot(value);
  const hasAgorot = Math.round(rounded * 100) % 100 !== 0;
  if (options?.forceDecimals || hasAgorot) {
    return ILS_DEC_FMT.format(rounded);
  }
  return ILS_INT_FMT.format(rounded);
}

/** True when two ILS values represent the same agorot count.
 *  Comparing floats directly is dangerous (0.1 + 0.2 !== 0.3); this
 *  helper folds the comparison through the integer representation. */
export function amountsEqual(a: number, b: number): boolean {
  return toAgorot(a) === toAgorot(b);
}
