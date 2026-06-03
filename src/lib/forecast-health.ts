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

// Phase 350 — five-band risk engine.
//
//   safe   → bank impact lands well above the daily burn budget
//   steady → comfortable cushion, balanced net Δ
//   watch  → margin shrinking, pending commitments climbing
//   risk   → small headroom and direction trending negative
//   danger → projected balance < 0 OR runway already collapsed
//
// The bands are computed from cushion-days + direction + pending
// commitments + days-to-salary so the gauge needle reflects more
// than just the projected number.

export type ForecastHealthBand =
  | "safe"
  | "steady"
  | "watch"
  | "risk"
  | "danger";

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
  steady: "צפי יציב",
  watch: "צפי רגיש",
  risk: "צפי בסיכון",
  danger: "צפי מסוכן",
};

export function forecastHealthScore(args: {
  startingBalance: number;
  projectedBalance: number;
  daysAhead: number;
  deltaInflow: number;
  deltaOutflow: number;
  /** Phase 350 — extra risk signals. All optional so callers that
   *  don't have them yet keep working. */
  pendingCommitmentsCount?: number;
  daysToNextSalary?: number | null;
  openCreditTransactionsCount?: number;
}): ForecastHealth {
  const {
    startingBalance,
    projectedBalance,
    daysAhead,
    deltaInflow,
    deltaOutflow,
    pendingCommitmentsCount = 0,
    daysToNextSalary = null,
    openCreditTransactionsCount = 0,
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

  // Cushion = projected balance vs notional daily burn. Floors at
  // ₪50/day so a fresh forecast doesn't divide by zero.
  const dailyBurn = Math.max(50, deltaOutflow / Math.max(1, daysAhead));
  const cushionDays = projectedBalance / dailyBurn;

  // Direction signal — net Δ over the window.
  const netDelta = deltaInflow - deltaOutflow;
  // Commitment pressure — many open credit transactions or pending
  // bank obligations bleed the score even when the absolute number
  // is OK.
  const commitmentPressure = Math.min(
    1,
    (openCreditTransactionsCount + pendingCommitmentsCount) / 12,
  );

  let band: ForecastHealthBand;
  let reason: string;

  if (cushionDays >= 30 && netDelta >= 0 && commitmentPressure < 0.4) {
    band = "safe";
    reason =
      projectedBalance >= startingBalance
        ? "התזרים מתחזק בטווח הזה — היתרה תעלה."
        : "יש כרית בטחון של מעל חודש קדימה.";
  } else if (cushionDays >= 20 && netDelta >= 0) {
    band = "steady";
    reason =
      daysToNextSalary !== null && daysToNextSalary <= daysAhead
        ? "משכורת בדרך — הקצב הצפוי שומר על יציבות."
        : "הקצב יציב והכרית סבירה.";
  } else if (cushionDays >= 10) {
    band = "watch";
    reason =
      netDelta < 0
        ? "יותר יוצא מנכנס בטווח. שמור על הקצב."
        : commitmentPressure > 0.5
          ? "הרבה חיובים פתוחים. שווה לסקור לפני קנייה חדשה."
          : "כרית בטחון בינונית.";
  } else if (cushionDays >= 3) {
    band = "risk";
    reason =
      netDelta < 0
        ? "התזרים יורד. כדאי לדחות חיוב גדול אם אפשר."
        : "מרווח דק. כל חיוב נוסף יורגש.";
  } else {
    band = "danger";
    reason =
      daysToNextSalary !== null && daysToNextSalary > daysAhead
        ? "מרווח קצר מאוד והמשכורת עוד רחוקה."
        : "מרווח קצר מאוד עד תום הטווח.";
  }

  // 0..100 normalization. cushionDays mapped to [0..60]. Direction
  // trim up to 20 pts. Commitment pressure trims up to 10 pts.
  const cushionScore = clamp01(cushionDays / 60) * 100;
  const directionPenalty =
    netDelta < 0
      ? Math.min(20, Math.abs(netDelta) / Math.max(1, startingBalance) * 20)
      : 0;
  const commitmentPenalty = commitmentPressure * 10;
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(cushionScore - directionPenalty - commitmentPenalty),
    ),
  );

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
