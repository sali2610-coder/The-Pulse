// Phase 346 — forecast-driven financial health score.
//
// Scores the projected balance at a chosen target date, with the
// trajectory between today and the target weighed in. Drives the
// inline "Pulse Forecast" gauge inside HeroFutureBalanceCard — the
// gauge that reacts the moment the user taps a different date chip
// instead of staying frozen on today's snapshot.
//
// Inputs:
//
//   startingBalance  bank anchor at "now"
//   projectedBalance balance at the chosen target date
//   daysAhead        offset in days (0 = live, 38 = "10 לחודש הבא")
//   deltaInflow      Σ income events in (today, target]
//   deltaOutflow     Σ card + bank-fixed + loan + manual events
//
// The score blends three signals:
//
//   1. Absolute headroom at the target — negative balance is the
//      worst case (band = "danger") regardless of trajectory.
//   2. Relative cushion vs the runway: a projected balance ≥ 30% of
//      what monthly outflow would burn in `daysAhead` reads as
//      "safe"; <5% reads as "tight".
//   3. Inflow vs outflow direction — if more cash leaves than enters
//      in the window, score drops a tier even if the absolute number
//      is positive.

export type ForecastHealthBand = "safe" | "watch" | "tight" | "danger";

export type ForecastHealth = {
  /** 0..100 — 0 worst, 100 best. */
  score: number;
  band: ForecastHealthBand;
  /** Hebrew display label tied to band. */
  label: string;
  /** Single-sentence "why" — used as the gauge subtitle. */
  reason: string;
};

const BAND_LABEL: Record<ForecastHealthBand, string> = {
  safe: "צפי בטוח",
  watch: "צפי מאוזן",
  tight: "צפי הדוק",
  danger: "צפי בסיכון",
};

export function forecastHealthScore(args: {
  startingBalance: number;
  projectedBalance: number;
  daysAhead: number;
  deltaInflow: number;
  deltaOutflow: number;
}): ForecastHealth {
  const {
    startingBalance,
    projectedBalance,
    daysAhead,
    deltaInflow,
    deltaOutflow,
  } = args;

  // Headline check — projected negative is always "danger".
  if (projectedBalance < 0) {
    const overdraft = Math.round(Math.abs(projectedBalance));
    return {
      score: clamp01(
        Math.max(0, 25 + projectedBalance / Math.max(1, startingBalance) * 25),
      ) * 100,
      band: "danger",
      label: BAND_LABEL.danger,
      reason: `צפויה חריגה של ₪${overdraft.toLocaleString("he-IL")} עד התאריך.`,
    };
  }

  // Cushion = projected balance vs a notional daily burn. The
  // notional burn falls back to a flat ₪50/day when the user has
  // no outflow yet (a fresh forecast), so the score doesn't divide
  // by zero.
  const dailyBurn = Math.max(50, deltaOutflow / Math.max(1, daysAhead));
  const cushionDays = projectedBalance / dailyBurn;

  // Direction signal — net Δ over the window.
  const netDelta = deltaInflow - deltaOutflow;

  let band: ForecastHealthBand;
  let reason: string;

  if (cushionDays >= 30 && netDelta >= 0) {
    band = "safe";
    reason =
      projectedBalance >= startingBalance
        ? "התזרים מתחזק בטווח הזה — היתרה תעלה."
        : "יש כרית בטחון של מעל חודש קדימה.";
  } else if (cushionDays >= 10) {
    band = "watch";
    reason =
      netDelta < 0
        ? "יותר יוצא מנכנס בטווח — שמור על הקצב."
        : "כרית בטחון בינונית. עוקבים אחר חיובים גדולים.";
  } else if (cushionDays >= 3) {
    band = "tight";
    reason =
      netDelta < 0
        ? "התזרים יורד. כדאי לדחות חיוב גדול אם אפשר."
        : "מרווח דק. כל חיוב נוסף יורגש.";
  } else {
    band = "tight";
    reason = "מרווח קצר מאוד עד תום הטווח.";
  }

  // 0..100 normalization. cushionDays mapped to [0..60] for the
  // numeric score so the inline needle sweeps visibly between
  // ranges. Direction trim subtracts up to 20 pts when net Δ is
  // negative regardless of cushion.
  const cushionScore = clamp01(cushionDays / 60) * 100;
  const directionPenalty =
    netDelta < 0
      ? Math.min(20, Math.abs(netDelta) / Math.max(1, startingBalance) * 20)
      : 0;
  const score = Math.max(0, Math.min(100, Math.round(cushionScore - directionPenalty)));

  return {
    score,
    band,
    label: BAND_LABEL[band],
    reason,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
