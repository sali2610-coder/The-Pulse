// Pending-transaction lifecycle classifier.
//
// A pending entry can be one of three things, and the UI tone
// changes per kind:
//
//   - awaiting_review   user-side Wallet partial waiting for a tap
//                       (needsConfirmation === true, no confirmedAt)
//   - bank_pending      bank reports it as "תלוי ועומד" / "pending"
//                       (bankPending === true)
//   - both              both flags set — Wallet captured a charge
//                       the bank hasn't finalized yet
//
// Each entry also gets a `mergeCandidate` flag: when another entry
// in the log matches by canonical merchant + ±1₪ + ±2-day window,
// the two are likely the SAME real-world transaction surfacing
// twice (Wallet first, SMS second). Useful for the "we'll merge
// this automatically" UI hint without actually doing the merge here
// (that's the existing findMergeTarget pipeline in dedup.ts).
//
// Pure compute. No store, no React.

import type { ExpenseEntry } from "@/types/finance";
import { merchantKey } from "@/lib/sanitize";

export type PendingKind =
  | "awaiting_review"
  | "bank_pending"
  | "both";

export type PendingClassification = {
  entry: ExpenseEntry;
  kind: PendingKind;
  /** True when another entry in the log looks like the same real
   *  transaction (likely merge candidate). */
  mergeCandidate: boolean;
};

export type PendingLifecycleReport = {
  classifications: PendingClassification[];
  counts: {
    awaitingReview: number;
    bankPending: number;
    both: number;
    mergeCandidates: number;
  };
};

const AMOUNT_TOL = 1; // ±1 ILS
const DAY_TOL_MS = 2 * 86_400_000;

export function classifyPending(args: {
  entries: ExpenseEntry[];
  now?: Date;
}): PendingLifecycleReport {
  const candidates: PendingClassification[] = [];
  const confirmed: ExpenseEntry[] = [];

  for (const e of args.entries) {
    if (e.confirmedAt) {
      confirmed.push(e);
      continue;
    }
    const needsReview = Boolean(e.needsConfirmation);
    const bank = Boolean(e.bankPending);
    if (!needsReview && !bank) {
      confirmed.push(e);
      continue;
    }
    const kind: PendingKind = needsReview && bank
      ? "both"
      : needsReview
        ? "awaiting_review"
        : "bank_pending";
    candidates.push({
      entry: e,
      kind,
      mergeCandidate: false,
    });
  }

  // Tag merge candidates against the confirmed pool.
  for (const c of candidates) {
    if (looksLikeMergeOf(c.entry, confirmed)) c.mergeCandidate = true;
  }

  const counts = {
    awaitingReview: candidates.filter((c) => c.kind === "awaiting_review").length,
    bankPending: candidates.filter((c) => c.kind === "bank_pending").length,
    both: candidates.filter((c) => c.kind === "both").length,
    mergeCandidates: candidates.filter((c) => c.mergeCandidate).length,
  };
  void args.now;
  return { classifications: candidates, counts };
}

function looksLikeMergeOf(
  candidate: ExpenseEntry,
  pool: ExpenseEntry[],
): boolean {
  const ck = merchantKey(candidate.merchant ?? candidate.note ?? "");
  if (!ck) return false;
  const cAmt = candidate.amount;
  const cTs = new Date(candidate.chargeDate).getTime();
  if (!Number.isFinite(cTs)) return false;
  for (const other of pool) {
    if (other.id === candidate.id) continue;
    if (other.isRefund) continue;
    const ok = merchantKey(other.merchant ?? other.note ?? "");
    if (ok !== ck) continue;
    const ot = new Date(other.chargeDate).getTime();
    if (!Number.isFinite(ot)) continue;
    if (Math.abs(ot - cTs) > DAY_TOL_MS) continue;
    if (Math.abs(other.amount - cAmt) > AMOUNT_TOL) continue;
    return true;
  }
  return false;
}
