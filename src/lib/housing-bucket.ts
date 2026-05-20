// Housing / living-cost bucket.
//
// Pure detection over existing RecurringRules. No new schema fields,
// no migration — we infer whether a rule belongs to the housing
// bucket from category + label keyword match. Keeps every existing
// rule editable while still giving the user a "what does my home
// actually cost" surface.
//
// Two ways a rule lands in the bucket:
//
//   1. Category is "bills" (covers the obvious utilities case).
//   2. Label or keywords match one of the housing label patterns
//      below — catches rules the user filed under "other" or
//      "shopping" but that are genuinely housing.
//
// Detection is deliberately conservative: false positives clutter
// the card with non-housing rows, so any pattern miss can be fixed
// by the user editing the rule label rather than us building a
// guessier matcher.

import type { CategoryId } from "@/lib/categories";
import type { MonthKey, RecurringRule } from "@/types/finance";
import { ruleSchedule } from "@/lib/installment-schedule";

export type HousingSubcategory =
  | "rent-mortgage"
  | "vaad-bayit"
  | "arnona"
  | "water"
  | "electricity"
  | "gas"
  | "internet"
  | "cellphone"
  | "insurance"
  | "maintenance"
  | "cleaning"
  | "streaming"
  | "other-housing";

const SUBCAT_PATTERNS: Array<{
  sub: HousingSubcategory;
  patterns: RegExp[];
}> = [
  {
    sub: "rent-mortgage",
    patterns: [/שכ"?[״"']?ד/, /שכירות/, /משכנתא/, /rent/i, /mortgage/i],
  },
  {
    sub: "vaad-bayit",
    patterns: [/ועד[ -]?בית/, /ועד/, /house\s*committee/i],
  },
  { sub: "arnona", patterns: [/ארנונה/, /arnona/i] },
  {
    sub: "water",
    patterns: [/מים/, /מי-?עיריה/, /water/i, /hagihon/i, /מי שופ/],
  },
  {
    sub: "electricity",
    patterns: [/חשמל/, /electricity/i, /iec/i, /electra/i],
  },
  { sub: "gas", patterns: [/גז/, /\bgas\b/i, /paz\s*gas/i] },
  {
    sub: "internet",
    patterns: [/אינטרנט/, /סיבים/, /בזק/, /חוט/, /partner/i, /hot/i, /internet/i, /fiber/i],
  },
  {
    sub: "cellphone",
    patterns: [/סלולר/, /פלאפון/, /סלקום/, /פרטנר/, /cellcom/i, /partner/i, /pelephone/i, /נייד/, /טלפון/, /phone/i],
  },
  {
    sub: "insurance",
    patterns: [/ביטוח/, /הראל/, /מגדל/, /כלל/, /insurance/i],
  },
  {
    sub: "maintenance",
    patterns: [/אחזקה/, /תיקון/, /maintenance/i, /repair/i],
  },
  {
    sub: "cleaning",
    patterns: [/ניקיון/, /נקיון/, /cleaning/i, /housekeep/i],
  },
  {
    sub: "streaming",
    patterns: [/netflix/i, /spotify/i, /youtube/i, /disney/i, /hbo/i, /apple\s*tv/i, /סטרימינג/, /yes/i, /HOT\s*VOD/i, /סלקום\s*tv/i],
  },
];

export function classifyHousingRule(
  rule: RecurringRule,
): HousingSubcategory | null {
  // Pure category filter: only "bills" passes by default. Other rules
  // need a stronger keyword signal to qualify.
  const inText = `${rule.label} ${rule.keywords.join(" ")}`;
  for (const { sub, patterns } of SUBCAT_PATTERNS) {
    if (patterns.some((p) => p.test(inText))) return sub;
  }
  // Category fallback: a "bills" rule we couldn't classify still
  // belongs to the housing bucket as "other-housing".
  if ((rule.category as CategoryId) === "bills") return "other-housing";
  return null;
}

export type HousingBucketRow = {
  sub: HousingSubcategory;
  rules: RecurringRule[];
  monthlyTotal: number;
};

export type HousingBucket = {
  rows: HousingBucketRow[];
  totalMonthly: number;
  /** Fraction of total monthly income consumed by the bucket.
   *  Undefined when income data is unavailable. */
  shareOfIncome?: number;
};

export function buildHousingBucket(args: {
  rules: RecurringRule[];
  totalMonthlyIncome: number;
  monthKey: MonthKey;
}): HousingBucket {
  const byKey = new Map<HousingSubcategory, HousingBucketRow>();

  for (const rule of args.rules) {
    if (!rule.active) continue;
    const sched = ruleSchedule(rule, args.monthKey);
    if (!sched.active) continue;
    const sub = classifyHousingRule(rule);
    if (!sub) continue;
    const row = byKey.get(sub) ?? {
      sub,
      rules: [],
      monthlyTotal: 0,
    };
    row.rules.push(rule);
    row.monthlyTotal += rule.estimatedAmount;
    byKey.set(sub, row);
  }

  const rows = [...byKey.values()].sort(
    (a, b) => b.monthlyTotal - a.monthlyTotal,
  );
  const totalMonthly = rows.reduce((sum, r) => sum + r.monthlyTotal, 0);
  const shareOfIncome =
    args.totalMonthlyIncome > 0
      ? totalMonthly / args.totalMonthlyIncome
      : undefined;

  return { rows, totalMonthly, shareOfIncome };
}

export const HOUSING_SUBCAT_LABEL: Record<HousingSubcategory, string> = {
  "rent-mortgage": "שכירות / משכנתא",
  "vaad-bayit": "ועד-בית",
  arnona: "ארנונה",
  water: "מים",
  electricity: "חשמל",
  gas: "גז",
  internet: "אינטרנט",
  cellphone: "סלולר",
  insurance: "ביטוח",
  maintenance: "אחזקה",
  cleaning: "ניקיון",
  streaming: "סטרימינג",
  "other-housing": "דיור נוסף",
};
