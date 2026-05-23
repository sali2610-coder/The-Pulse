// Spending diet — category-level reduction targets.
//
// Bucket every category into one of three classes:
//
//   - essential  — bills, health, education, transport. Reducing
//                  these usually requires a contract change, not a
//                  daily-habit shift. Surfaced for awareness only.
//   - flexible   — food, shopping, gifts, other. Day-to-day discretion;
//                  this is the bucket the user can actually trim.
//   - risky      — entertainment + any category whose current pace runs
//                  ≥30% above the 3-month median. "Risky growth area"
//                  per the spec — small numbers turning into a habit.
//
// For each flexible / risky row, suggest a reasonable reduction
// anchor (clamped per-bucket caps). Numbers come from the existing
// `categoryPace` engine — no parallel slice math.

import type { CategoryId } from "@/lib/categories";
import { getCategory } from "@/lib/categories";
import type { ExpenseEntry, MonthKey } from "@/types/finance";
import { monthKeyOf } from "@/lib/dates";
import { categoryPace, type CategoryPaceRow } from "@/lib/category-pace";

export type DietClass = "essential" | "flexible" | "risky";

export type DietRow = {
  category: CategoryId;
  label: string;
  classification: DietClass;
  projectedEOM: number;
  priorMedian: number;
  /** Suggested monthly target the user could aim for without hitting
   *  essentials. `null` for essentials (we don't propose cuts there). */
  suggestedTarget: number | null;
  /** Hebrew one-liner the UI renders verbatim. */
  recommendation: string;
};

export type SpendingDiet = {
  rows: DietRow[];
  /** Sum of suggested reductions across flexible + risky rows. */
  potentialSavings: number;
};

const ESSENTIAL_CATS: CategoryId[] = [
  "bills",
  "health",
  "education",
  "transport",
];

const RISKY_BASELINE: CategoryId[] = ["entertainment"];

const DRIFT_RATIO_RISKY = 0.3;
// Cap reductions so the engine never proposes shaving more than this
// share of the category. Avoids "spend ₪0 on food" nonsense.
const REDUCTION_CAP = 0.25;
const MIN_REDUCTION = 50;

export function spendingDiet(args: {
  entries: ExpenseEntry[];
  monthKey?: MonthKey;
  now?: Date;
}): SpendingDiet {
  const now = args.now ?? new Date();
  const monthKey: MonthKey = args.monthKey ?? monthKeyOf(now);
  const pace = categoryPace({ entries: args.entries, monthKey, now });

  const rows: DietRow[] = pace.map((row) => buildRow(row));
  let potentialSavings = 0;
  for (const row of rows) {
    if (row.suggestedTarget !== null && row.projectedEOM > 0) {
      potentialSavings += Math.max(0, row.projectedEOM - row.suggestedTarget);
    }
  }
  potentialSavings = Math.round(potentialSavings);

  return { rows, potentialSavings };
}

function buildRow(row: CategoryPaceRow): DietRow {
  const meta = getCategory(row.category);
  const classification = classify(row);
  const projected = Math.round(row.projectedEOM);
  const prior = Math.round(row.priorMedian);

  if (classification === "essential") {
    return {
      category: row.category,
      label: meta.label,
      classification,
      projectedEOM: projected,
      priorMedian: prior,
      suggestedTarget: null,
      recommendation: prior > 0 && projected > prior * 1.2
        ? `${meta.label} בקטגוריית "חיוני" עלתה ב־${projected - prior} ש"ח לעומת ממוצע 3 חודשים. כדאי לוודא שהתעריף לא קפץ.`
        : `${meta.label} — הוצאה חיונית. כרגע לא ממליצים לחתוך.`,
    };
  }

  const cap = Math.round(projected * REDUCTION_CAP);
  const suggestedReduction = Math.max(MIN_REDUCTION, Math.min(cap, projected - prior));
  const target = Math.max(0, projected - Math.max(MIN_REDUCTION, suggestedReduction));

  if (classification === "risky") {
    return {
      category: row.category,
      label: meta.label,
      classification,
      projectedEOM: projected,
      priorMedian: prior,
      suggestedTarget: target,
      recommendation: prior > 0
        ? `${meta.label} צפויה לסיים ב־${projected} ש"ח, מעל הממוצע. נסה להחזיר לקצב ${target} ש"ח.`
        : `${meta.label} בצמיחה — שווה להגדיר תקרה חודשית סביב ${target} ש"ח.`,
    };
  }

  return {
    category: row.category,
    label: meta.label,
    classification,
    projectedEOM: projected,
    priorMedian: prior,
    suggestedTarget: target,
    recommendation: prior > 0
      ? `${meta.label} — אם תחתוך ב־${projected - target} ש"ח החודש תרוויח חיסכון ישיר.`
      : `${meta.label} — קטגוריה גמישה. נסה לשמור על תקציב חודשי סביב ${target} ש"ח.`,
  };
}

function classify(row: CategoryPaceRow): DietClass {
  if (ESSENTIAL_CATS.includes(row.category)) return "essential";
  if (RISKY_BASELINE.includes(row.category)) return "risky";
  if (
    row.priorMedian > 0 &&
    (row.projectedEOM - row.priorMedian) / row.priorMedian >= DRIFT_RATIO_RISKY
  ) {
    return "risky";
  }
  return "flexible";
}
