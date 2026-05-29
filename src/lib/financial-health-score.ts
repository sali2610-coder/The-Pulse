// Phase 282 — single-number financial-health score on top of the
// existing FinancialSnapshot. Pure derivation, no parallel math.
//
// The score is bucketed first by `snapshot.riskLevel` (the same
// classifier the rest of the dashboard already uses to color cards
// and gate insights), then refined within the bucket using how
// healthy the projected-vs-current ratio is and how much absolute
// anchor depth the user has. Final number is a 0–100 integer.

import type { FinancialSnapshot } from "@/lib/financial-snapshot";

export type FinancialHealthScore = {
  /** 0..100. */
  score: number;
  /** Coarse tone — drives the gauge color band. */
  tone: "ok" | "watch" | "danger";
  /** Short Hebrew label rendered under the score. */
  label: string;
};

export function financialHealthScore(
  snap: FinancialSnapshot,
): FinancialHealthScore {
  let score: number;
  switch (snap.riskLevel) {
    case "overdraft":
      score = 12;
      break;
    case "tight":
      score = 35;
      break;
    case "watch":
      score = 62;
      break;
    case "safe":
    default:
      score = 82;
      break;
  }

  // Anchor depth bonus — bigger cushion = healthier, even at the
  // same risk bucket. Cap at +8 so a single rich account can't
  // override an "overdraft" classification.
  if (snap.currentBalance > 0) {
    const anchorBonus = Math.min(8, snap.currentBalance / 8_000);
    score += Math.round(anchorBonus);
  } else {
    score -= 4;
  }

  // Penalize a forecast that's deeply negative even within the
  // riskLevel — overdraft of ₪20k is worse than overdraft of ₪2k.
  if (snap.projectedBalanceWithoutDiscretionary < 0) {
    const depth = Math.min(
      10,
      Math.abs(snap.projectedBalanceWithoutDiscretionary) / 2_000,
    );
    score -= Math.round(depth);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const tone: FinancialHealthScore["tone"] =
    score >= 70 ? "ok" : score >= 40 ? "watch" : "danger";

  const label =
    tone === "ok"
      ? "בריא"
      : tone === "watch"
        ? "כדאי לעקוב"
        : "סיכון תזרימי";

  return { score, tone, label };
}
