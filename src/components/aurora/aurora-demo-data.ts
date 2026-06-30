"use client";

// Phase 432 part 4 · AURORA v1 — Demo data fixtures.
//
// Realistic Hebrew financial scenario used when the live store
// returns no data (cold /aurora-preview reviews, freshly cloned
// repos, anonymous visitors). Production users on / with a real
// Supabase session ALWAYS see live engine data — this hook only
// engages when `useAuroraHome.ready` is false OR `hasAnchors`
// is false. A `isDemo` flag flows through the composition layer
// so a subtle "תצוגת דמו" eyebrow can mark the screen.
//
// Scenario:
//   - User Sali, salary day 3 (₪18,000 net)
//   - 3 active loans (Studies 2,700 / Car 870 / Mortgage 4,200)
//   - Mid-month, budget ₪25,000, healthy state
//   - Daily allowance ₪240, spent ₪88 today
//   - Weekly bars: 14 / 22 / 0 / 380 / 60 / 0 / 88
//   - Upcoming 14d: salary, car loan, mortgage, electricity
//   - Recent activity: 4 mixed rows including refund + withdrawal

import type {
  AuroraHomeData,
  AuroraUpcomingEvent,
} from "./use-aurora-home";

function isoDaysFromNow(d: number, hour = 12): string {
  const t = new Date();
  t.setDate(t.getDate() + d);
  t.setHours(hour, 0, 0, 0);
  return t.toISOString();
}

function isoHoursFromNow(h: number): string {
  const t = new Date();
  t.setHours(t.getHours() - h);
  return t.toISOString();
}

export const DEMO_AURORA_HOME: AuroraHomeData & { isDemo: true } = {
  ready: true,
  hasAnchors: true,
  livBalance: 19_130,
  eomForecast: 14_580,
  eomBudget: 25_000,
  safetyState: "calm",
  safetyLabel: "בטוח",
  monthLabel: "יוני 2026",
  daysToEom: 8,
  spentToday: 88,
  dailyAllowanceAmount: 240,
  daysRemaining: 8,
  delta24h: 470,
  delta24hCount: 3,
  lastOutLabel: "סופרסל",
  nextEvent: {
    label: "משכורת",
    amount: 18_000,
    whenISO: isoDaysFromNow(3),
    kind: "income" as const,
    daysUntil: 3,
  } satisfies AuroraUpcomingEvent,
  pendingCount: 2,
  loansThisMonth: 7_770, // 2,700 + 870 + 4,200
  fixedThisMonth: 1_460, // חשמל + מים + אינטרנט + סלולר
  cardsThisMonth: 2_150,
  incomeThisMonth: 18_000,
  budgetTotal: 25_000,
  budgetSpent: 11_380,
  budgetRemaining: 13_620,
  budgetPct: 46,
  weeklySpend: [
    { dayISO: isoDaysFromNow(-6), amount: 14, dayIndex: 0 },
    { dayISO: isoDaysFromNow(-5), amount: 220, dayIndex: 1 },
    { dayISO: isoDaysFromNow(-4), amount: 0, dayIndex: 2 },
    { dayISO: isoDaysFromNow(-3), amount: 380, dayIndex: 3 },
    { dayISO: isoDaysFromNow(-2), amount: 60, dayIndex: 4 },
    { dayISO: isoDaysFromNow(-1), amount: 0, dayIndex: 5 },
    { dayISO: isoDaysFromNow(0), amount: 88, dayIndex: 6 },
  ],
  upcomingFortnight: [
    {
      label: "משכורת · אורון",
      amount: 18_000,
      whenISO: isoDaysFromNow(3),
      kind: "income",
      daysUntil: 3,
    },
    {
      label: "הלוואת רכב",
      amount: 870,
      whenISO: isoDaysFromNow(5),
      kind: "loan",
      daysUntil: 5,
    },
    {
      label: "חשבון חשמל",
      amount: 340,
      whenISO: isoDaysFromNow(6),
      kind: "bank_debit",
      daysUntil: 6,
    },
    {
      label: "ויזה · מקס",
      amount: 2_150,
      whenISO: isoDaysFromNow(10),
      kind: "card",
      daysUntil: 10,
    },
    {
      label: "משכנתא",
      amount: 4_200,
      whenISO: isoDaysFromNow(11),
      kind: "loan",
      daysUntil: 11,
    },
    {
      label: "הלוואת לימודים",
      amount: 2_700,
      whenISO: isoDaysFromNow(13),
      kind: "loan",
      daysUntil: 13,
    },
  ],
  recentActivity: [
    {
      id: "demo-1",
      entryId: "demo-1",
      label: "סופרסל · גבעתיים",
      amount: 88,
      whenISO: isoHoursFromNow(1),
      direction: "out",
      isWithdrawal: false,
      isRefund: false,
      category: "groceries",
    },
    {
      id: "demo-2",
      entryId: "demo-2",
      label: "החזר · אמזון",
      amount: 64,
      whenISO: isoHoursFromNow(6),
      direction: "in",
      isWithdrawal: false,
      isRefund: true,
      category: "shopping",
    },
    {
      id: "demo-3",
      entryId: "demo-3",
      label: "משיכת מזומן · בנק",
      amount: 200,
      whenISO: isoHoursFromNow(20),
      direction: "out",
      isWithdrawal: true,
      isRefund: false,
      category: "cash",
    },
    {
      id: "demo-4",
      entryId: "demo-4",
      label: "תיק יד · ZARA",
      amount: 182,
      whenISO: isoHoursFromNow(28),
      direction: "out",
      isWithdrawal: false,
      isRefund: false,
      category: "shopping",
    },
    {
      id: "demo-5",
      entryId: "demo-5",
      label: "פז · דלק 95",
      amount: 235,
      whenISO: isoHoursFromNow(40),
      direction: "out",
      isWithdrawal: false,
      isRefund: false,
      category: "fuel",
    },
    {
      id: "demo-6",
      entryId: "demo-6",
      label: "Spotify Premium",
      amount: 24,
      whenISO: isoHoursFromNow(72),
      direction: "out",
      isWithdrawal: false,
      isRefund: false,
      category: "subscriptions",
    },
  ],
  coachSentence:
    "אתה במסלול טוב — אחרי המשכורת בעוד 3 ימים, מרווח לסוף החודש ₪14,580. שמור על קצב של 240 ₪ ביום.",
  coachVariant: "loud",
  cashflow30d: [],
  topCategories: [],
  goals: [],
  subscriptions: [],
  velocity: { thisWeek: 0, lastWeek: 0, pctVsLast: 0 },
  insights: [],
  isDemo: true,
};

// Six-month per-lane history for the lane sparklines. Indexed
// most-recent → oldest. Numbers are smoothed near-realistic
// installments + steady recurring bills.
export const DEMO_LANE_HISTORY = {
  loans: [7_770, 7_770, 7_770, 7_770, 7_770, 7_770],
  fixed: [1_460, 1_420, 1_510, 1_440, 1_400, 1_470],
  cards: [2_150, 1_980, 2_460, 2_310, 1_890, 2_120],
};

// Multiple CFO sentences the composition can cycle through to
// give the screen a "live" rotating insight feel. Reviewer never
// sees the SAME sentence twice in a session.
export const DEMO_COACH_LINES: ReadonlyArray<string> = [
  "אתה במסלול טוב — אחרי המשכורת בעוד 3 ימים, מרווח לסוף החודש ₪14,580.",
  "קצב 'מסעדות' השבוע: ₪0 — שיא חודשי. חיסכון צפוי ₪380.",
  "מנוי SHIRA YOGA · ₪89 ללא שימוש 47 ימים. שווה לבטל?",
  "אם תמשיך לעמוד ביעד היומי, יוני יסתיים 7% מעל הממוצע השנתי שלך.",
];

// Demo signals for the new Phase 4 enrichment sections. Same
// fall-through rule: only surfaced when the store is empty.

// 30-day cashflow forecast — running balance day-by-day.
// Realistic shape: dips on loan / rent days, jumps on salary.
export const DEMO_CASHFLOW_30D: number[] = [
  19_130, 18_950, 18_950, 19_780, 36_780, 36_220, 35_350, 35_010, 34_290,
  34_290, 33_790, 33_790, 33_590, 33_340, 33_340, 33_100, 32_870, 32_870,
  30_720, 30_500, 30_280, 30_100, 29_870, 29_870, 26_500, 26_240, 26_010,
  25_790, 25_790, 25_540,
];

// Top spending categories this month.
export type DemoCategory = {
  key: string;
  label: string;
  amount: number;
  color: string;
  delta: number; // pct vs last month, signed
};
export const DEMO_CATEGORIES: DemoCategory[] = [
  { key: "groceries",    label: "סופר",       amount: 2_410, color: "#34D399", delta: -7 },
  { key: "fuel",         label: "דלק",        amount: 780,   color: "#FACC15", delta: 12 },
  { key: "restaurants",  label: "מסעדות",     amount: 640,   color: "#F87171", delta: 22 },
  { key: "shopping",     label: "שופינג",     amount: 410,   color: "#A78BFA", delta: -18 },
  { key: "transport",    label: "תחבורה",     amount: 240,   color: "#75F5FF", delta: -3 },
];

// Savings / wish goals.
export type DemoGoal = {
  key: string;
  label: string;
  amount: number;
  target: number;
  pct: number;
  dueLabel: string;
  tone: "safe" | "watch" | "stress";
};
export const DEMO_GOALS: DemoGoal[] = [
  {
    key: "japan",
    label: "טיול ליפן",
    amount: 22_800,
    target: 30_000,
    pct: 76,
    dueLabel: "עוד 47 ימים",
    tone: "safe",
  },
  {
    key: "iphone",
    label: "iPhone 17",
    amount: 3_400,
    target: 8_000,
    pct: 42,
    dueLabel: "עוד 92 ימים",
    tone: "watch",
  },
];

// Dormant / under-used subscriptions the AI panel can surface.
export type DemoSubscription = {
  key: string;
  label: string;
  amount: number;
  unusedDays: number;
};
export const DEMO_SUBSCRIPTIONS: DemoSubscription[] = [
  { key: "yoga", label: "SHIRA YOGA", amount: 89, unusedDays: 47 },
  { key: "ny-times", label: "NY Times Digital", amount: 21, unusedDays: 31 },
  { key: "tinder", label: "Tinder Gold", amount: 39, unusedDays: 18 },
];

// Velocity — change in 7-day spend vs the previous 7-day window.
// Signed pct (negative = improving).
export const DEMO_VELOCITY = {
  thisWeek: 562, // sum of weeklySpend
  lastWeek: 638,
  pctVsLast: -12, // (562-638)/638
};

// Multi-tone AI Insights deck. Each has a kind (info / praise /
// warn / suggest), a sentence, optional amount, and a CTA label
// for the bottom-sheet drill-down. The composition cycles through
// the deck so the screen always has fresh intelligence.
export type DemoInsight = {
  key: string;
  kind: "praise" | "info" | "warn" | "suggest";
  sentence: string;
  amount?: number;
  cta?: string;
};
export const DEMO_INSIGHTS: DemoInsight[] = [
  {
    key: "velocity-down",
    kind: "praise",
    sentence: "השבוע הוצאת 12% פחות מהשבוע הקודם.",
    amount: 76,
    cta: "ראה ניתוח שבועי",
  },
  {
    key: "pace-forecast",
    kind: "info",
    sentence: "אם תשמור על הקצב, יוני יסתיים עם ₪2,340 פנויים מעל היעד.",
    cta: "פתח חיזוי",
  },
  {
    key: "restaurants-up",
    kind: "warn",
    sentence: "הוצאות מסעדות עלו השבוע ב-22% מהממוצע.",
    amount: 640,
    cta: "ראה קטגוריה",
  },
  {
    key: "dormant-subs",
    kind: "suggest",
    sentence: "3 מנויים פעילים שלא היו בשימוש לאחרונה — ₪149 לחודש.",
    cta: "סקור מנויים",
  },
  {
    key: "salary-near",
    kind: "info",
    sentence: "המשכורת מגיעה בעוד 3 ימים — תיכף תקפוץ ל-₪37,130.",
    amount: 18_000,
    cta: "פתח ציר הכנסות",
  },
];
