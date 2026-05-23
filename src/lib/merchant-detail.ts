// Per-merchant detail aggregator for the transaction drilldown sheet.
//
// Given a single ExpenseEntry + the user's full entry/rules store,
// derives a one-shot summary the drilldown can render without firing
// any additional store reads:
//
//   - visits90       — number of charges from this merchant in the
//                      last 90 days
//   - averageTicket  — mean charge amount over those 90 days
//   - lastVisit      — most recent prior charge date (ISO), excluding
//                      the entry being viewed
//   - daysSinceLast  — integer days between lastVisit and now
//   - matchedRule    — linked RecurringRule (when present)
//   - linkedSubs     — other rules in the same category sharing a
//                      label token (visual "same family" hint)
//   - isUnusual      — true when the entry amount is ≥1.5× the 90-day
//                      average (signals "this charge stands out")
//   - installmentContext — slice index + total count for installment
//                      plans, or null for one-shot charges
//   - confidence     — coarse bucket for the strength of the merchant
//                      identity (low when no merchant + no rule,
//                      medium when merchant only, high when matched)
//
// Pure. No side effects.

import type { ExpenseEntry, RecurringRule } from "@/types/finance";
import { installmentProgress } from "@/lib/projections";
import { merchantKey, sanitizeMerchant } from "@/lib/sanitize";

export type MerchantConfidence = "low" | "medium" | "high";

export type MerchantDetail = {
  /** Echoed for downstream convenience. */
  entryId: string;
  /** Canonical display label (sanitized brand). */
  label: string;
  /** Canonical key for cross-entry grouping. */
  key: string;
  visits90: number;
  averageTicket: number;
  lastVisit: string | null;
  daysSinceLast: number | null;
  matchedRule: RecurringRule | null;
  linkedSubs: RecurringRule[];
  isUnusual: boolean;
  installmentContext:
    | { index: number; total: number; perMonth: number }
    | null;
  confidence: MerchantConfidence;
};

const WINDOW_DAYS = 90;
const UNUSUAL_RATIO = 1.5;

export function merchantDetail(args: {
  entry: ExpenseEntry;
  entries: ExpenseEntry[];
  rules?: RecurringRule[];
  now?: Date;
}): MerchantDetail {
  const now = args.now ?? new Date();
  const cutoff = now.getTime() - WINDOW_DAYS * 86_400_000;
  const raw = args.entry.merchant ?? args.entry.note ?? "";
  const key = merchantKey(raw);
  const label = sanitizeMerchant(raw) || raw.trim() || "ללא בית עסק";

  let visits = 0;
  let sum = 0;
  let lastTs = 0;
  let lastIso: string | null = null;

  if (key) {
    for (const e of args.entries) {
      if (e.id === args.entry.id) continue;
      if (e.needsConfirmation) continue;
      if (e.bankPending) continue;
      if (e.excludeFromBudget) continue;
      if (e.isRefund) continue;
      if (e.currency && e.currency !== "ILS") continue;
      const ek = merchantKey(e.merchant ?? e.note ?? "");
      if (ek !== key) continue;
      const ts = new Date(e.chargeDate).getTime();
      if (Number.isNaN(ts)) continue;
      if (ts < cutoff) continue;
      visits++;
      sum += e.amount / Math.max(1, e.installments);
      if (ts > lastTs) {
        lastTs = ts;
        lastIso = e.chargeDate;
      }
    }
  }

  const averageTicket =
    visits > 0 ? Math.round((sum / visits) * 100) / 100 : 0;
  const daysSinceLast =
    lastTs > 0 ? Math.floor((now.getTime() - lastTs) / 86_400_000) : null;
  const isUnusual =
    visits >= 3 &&
    averageTicket > 0 &&
    args.entry.amount / Math.max(1, args.entry.installments) >=
      averageTicket * UNUSUAL_RATIO;

  // Linked rule + look-alike family.
  const allRules = args.rules ?? [];
  const matchedRule =
    allRules.find((r) => r.id === args.entry.matchedRuleId) ?? null;
  const linkedSubs: RecurringRule[] = [];
  if (matchedRule) {
    const tokens = tokenize(matchedRule.label);
    for (const r of allRules) {
      if (r.id === matchedRule.id) continue;
      if (r.category !== matchedRule.category) continue;
      const overlap = tokenize(r.label).some(
        (t) => t.length >= 3 && tokens.includes(t),
      );
      if (overlap) linkedSubs.push(r);
    }
  }

  // Installment context.
  let installmentContext: MerchantDetail["installmentContext"] = null;
  if (args.entry.installments && args.entry.installments > 1) {
    const prog = installmentProgress(args.entry, now);
    installmentContext = {
      index: Math.min(prog.total, prog.paid + (prog.isComplete ? 0 : 1)),
      total: args.entry.installments,
      perMonth:
        Math.round((args.entry.amount / args.entry.installments) * 100) / 100,
    };
  }

  const confidence: MerchantConfidence = matchedRule
    ? "high"
    : key
      ? "medium"
      : "low";

  return {
    entryId: args.entry.id,
    label,
    key: key ?? "",
    visits90: visits,
    averageTicket,
    lastVisit: lastIso,
    daysSinceLast,
    matchedRule,
    linkedSubs,
    isUnusual,
    installmentContext,
    confidence,
  };
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}
