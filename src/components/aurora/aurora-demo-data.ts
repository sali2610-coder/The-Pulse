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
