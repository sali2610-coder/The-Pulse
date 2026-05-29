"use client";

// Phase 225 — consumer-first dashboard refactor.
//
// Replaces the analyst-style 80+ card bento with a calm hero stack
// + grouped collapsed sections. Reuses every existing calculation
// (forecast, liquidity, risk-warnings, cash-flow buckets …); only
// the visual hierarchy + density changes.
//
// First-paint reveals three hero cards and six collapsed section
// headers. Each header shows a single colored summary chip so the
// user reads the bottom-line of every section without expanding.

import { useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";

import { useFinanceStore } from "@/lib/store";
import { usePulseBudget } from "@/lib/use-pulse-budget";
import { ErrorBoundary } from "@/components/error-boundary";
import { FloatingCTA } from "@/components/dashboard/floating-cta";
import { ExpenseDialog } from "@/components/expense-form/expense-dialog";
import { SnapshotProvider } from "@/lib/snapshot-context";
import { useCloudSyncState } from "@/lib/supabase/cloud-sync-context";
import { DashboardSection } from "@/components/dashboard/dashboard-section";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { computeSummaries } from "@/lib/dashboard-section-summaries";

import { FinancialHealthGauge } from "@/components/dashboard/financial-health-gauge";
import { useAttentionCount } from "@/components/dashboard/attention-center";
import { openAttentionCenter } from "@/lib/use-attention-center";
import { motion as fmMotion } from "framer-motion";
import { Bell as BellIcon, ArrowLeft as ArrowLeftIcon } from "lucide-react";
import { tap as hapticTap } from "@/lib/haptics";
import { HeroSpendableCard } from "@/components/dashboard/simple/hero-spendable-card";
import { HeroInsightCard } from "@/components/dashboard/simple/hero-insight-card";
import { HeroFutureBalanceCard } from "@/components/dashboard/simple/hero-future-balance-card";

const lazy = (
  loader: () => Promise<{
    default: React.ComponentType<Record<string, unknown>>;
  }>,
) => dynamic(loader, { ssr: false });

// ── Always-on critical surfaces ────────────────────────────────────
const WelcomeSetupCard = lazy(() =>
  import("@/components/dashboard/welcome-setup-card").then((m) => ({
    default:
      m.WelcomeSetupCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const StaleAnchorsBanner = lazy(() =>
  import("@/components/dashboard/stale-anchors-banner").then((m) => ({
    default:
      m.StaleAnchorsBanner as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const PendingTray = lazy(() =>
  import("@/components/dashboard/pending-tray").then((m) => ({
    default:
      m.PendingTray as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

// Phase 285 — future-cashflow lazy components removed from Home.
// They still ship via the "עתידי" tab.

// Phase 286 — credit-cards lazies removed from Home. CategorySpendCard
// kept because the "ניתוחים וסטטיסטיקות" section still uses it.
const CategorySpendCard = lazy(() =>
  import("@/components/dashboard/category-spend-card").then((m) => ({
    default:
      m.CategorySpendCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

// ── Obligations section ───────────────────────────────────────────
const LoanSummaryCard = lazy(() =>
  import("@/components/dashboard/loan-summary-card").then((m) => ({
    default:
      m.LoanSummaryCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const HousingCard = lazy(() =>
  import("@/components/dashboard/housing-card").then((m) => ({
    default:
      m.HousingCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const RecurringCalendarCard = lazy(() =>
  import("@/components/dashboard/recurring-calendar-card").then((m) => ({
    default:
      m.RecurringCalendarCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const ObligationsTimelineCard = lazy(() =>
  import("@/components/dashboard/obligations-timeline-card").then((m) => ({
    default:
      m.ObligationsTimelineCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

// ── Income section ────────────────────────────────────────────────
const IncomeBreakdownCard = lazy(() =>
  import("@/components/dashboard/income-breakdown-card").then((m) => ({
    default:
      m.IncomeBreakdownCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const IncomeForecastCard = lazy(() =>
  import("@/components/dashboard/income-forecast-card").then((m) => ({
    default:
      m.IncomeForecastCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

// ── Analytics section ─────────────────────────────────────────────
const CategoryDonut = lazy(() =>
  import("@/components/dashboard/category-donut").then((m) => ({
    default:
      m.CategoryDonut as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const CategoryParetoCard = lazy(() =>
  import("@/components/dashboard/category-pareto-card").then((m) => ({
    default:
      m.CategoryParetoCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const CategoryPaceCard = lazy(() =>
  import("@/components/dashboard/category-pace-card").then((m) => ({
    default:
      m.CategoryPaceCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const SpendSplitCard = lazy(() =>
  import("@/components/dashboard/spend-split-card").then((m) => ({
    default:
      m.SpendSplitCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const NetWorthCard = lazy(() =>
  import("@/components/dashboard/net-worth-card").then((m) => ({
    default:
      m.NetWorthCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const NetWorthTrendCard = lazy(() =>
  import("@/components/dashboard/net-worth-trend-card").then((m) => ({
    default:
      m.NetWorthTrendCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const RunwayCard = lazy(() =>
  import("@/components/dashboard/runway-card").then((m) => ({
    default:
      m.RunwayCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const FixedCostRatioCard = lazy(() =>
  import("@/components/dashboard/fixed-cost-ratio-card").then((m) => ({
    default:
      m.FixedCostRatioCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const AvgTicketCard = lazy(() =>
  import("@/components/dashboard/avg-ticket-card").then((m) => ({
    default:
      m.AvgTicketCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const WeekendSpendCard = lazy(() =>
  import("@/components/dashboard/weekend-spend-card").then((m) => ({
    default:
      m.WeekendSpendCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const HeatmapMini = lazy(() =>
  import("@/components/dashboard/heatmap-mini").then((m) => ({
    default:
      m.HeatmapMini as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

// ── Watch / subscriptions / anomalies section ────────────────────
const SubscriptionReviewCard = lazy(() =>
  import("@/components/dashboard/subscription-review-card").then((m) => ({
    default:
      m.SubscriptionReviewCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const SubscriptionRadarCard = lazy(() =>
  import("@/components/dashboard/subscription-radar-card").then((m) => ({
    default:
      m.SubscriptionRadarCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const RiskWarningsCard = lazy(() =>
  import("@/components/dashboard/risk-warnings-card").then((m) => ({
    default:
      m.RiskWarningsCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const AnomalyBanner = lazy(() =>
  import("@/components/dashboard/anomaly-banner").then((m) => ({
    default:
      m.AnomalyBanner as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const AnomaliesCard = lazy(() =>
  import("@/components/dashboard/anomalies-card").then((m) => ({
    default:
      m.AnomaliesCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const SmartInsightsCard = lazy(() =>
  import("@/components/dashboard/smart-insights-card").then((m) => ({
    default:
      m.SmartInsightsCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const SmartRecommendationsCard = lazy(() =>
  import("@/components/dashboard/smart-recommendations-card").then((m) => ({
    default:
      m.SmartRecommendationsCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

// Phase 295 — "פירוט מתקדם" overflow section retired. The six lazy
// declarations it hosted (PulseBar, SmartSummaryCard,
// SpentThisMonthCard, AccountBridgeCard, ExpectedBalanceCard,
// DailyInsightsCard) are removed from Home; the components remain on
// disk so other surfaces that import them keep working.
const TodayPulseCard = lazy(() =>
  import("@/components/dashboard/today-pulse-card").then((m) => ({
    default:
      m.TodayPulseCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const RecentActivity = lazy(() =>
  import("@/components/dashboard/recent-activity").then((m) => ({
    default:
      m.RecentActivity as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const CopilotCard = lazy(() =>
  import("@/components/dashboard/copilot-card").then((m) => ({
    default:
      m.CopilotCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
function Safe({ name, children }: { name: string; children: ReactNode }) {
  return <ErrorBoundary name={name}>{children}</ErrorBoundary>;
}

export function DashboardTab() {
  const [open, setOpen] = useState(false);
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);
  const budgetMode = useFinanceStore((s) => s.budgetMode);
  const pulseBudget = usePulseBudget({ monthlyBudget, budgetMode });
  const cloudSync = useCloudSyncState();

  const summaries = useMemo(() => {
    if (!hydrated) return null;
    // Phase 238 — summaries reflect what the user sees on the hero
    // stack, so pass the EFFECTIVE budget rather than the raw store
    // value. Manual mode is a no-op (effective === raw).
    return computeSummaries({
      accounts,
      loans,
      incomes,
      rules,
      statuses,
      entries,
      monthlyBudget: pulseBudget,
    });
  }, [
    hydrated,
    accounts,
    loans,
    incomes,
    rules,
    statuses,
    entries,
    pulseBudget,
  ]);

  const showCurtain = Boolean(
    cloudSync?.configured &&
      (!cloudSync.verified ||
        (cloudSync.authenticated && !cloudSync.hydrated)),
  );

  if (showCurtain) {
    return <DashboardSkeleton />;
  }

  return (
    <SnapshotProvider>
      <div className="grid grid-cols-1 gap-4 pb-28 sm:grid-cols-6 sm:gap-4 sm:pb-32">
        {/* ── Critical banners — render only when relevant.
            Phase 276 — `empty:hidden` collapses the wrapper div when
            the lazy-loaded child renders null so the grid doesn't
            accumulate phantom rows (each empty row was still adding
            a gap-4 between visible cards). */}
        <div className="sm:col-span-6 empty:hidden">
          <Safe name="WelcomeSetupCard">
            <WelcomeSetupCard />
          </Safe>
        </div>
        <div className="sm:col-span-6 empty:hidden">
          <Safe name="StaleAnchorsBanner">
            <StaleAnchorsBanner />
          </Safe>
        </div>
        <div className="sm:col-span-6 empty:hidden">
          <Safe name="PendingTray">
            <PendingTray />
          </Safe>
        </div>

        {/* Phase 294 — Attention Center entry banner. Renders only
           when there's at least one item; opens the bottom sheet
           that lists pending confirmations, AI risks, and recurring
           review items. */}
        <div className="sm:col-span-6 empty:hidden">
          <Safe name="AttentionBanner">
            <AttentionBanner />
          </Safe>
        </div>

        {/* Phase 275 — "הפעימה של היום" lifted to the very top of
           Home above the hero stack. It's emotionally powerful and
           sets the day's tone before any numbers. */}
        <div className="sm:col-span-6 empty:hidden">
          <Safe name="TodayPulseCard">
            <TodayPulseCard />
          </Safe>
        </div>

        {/* Phase 282 — premium financial-health gauge. Single needle,
           single score. Reads from the same buildFinancialSnapshot
           every other card uses so the dashboard never disagrees with
           itself. */}
        <div className="sm:col-span-6 empty:hidden">
          <Safe name="FinancialHealthGauge">
            <FinancialHealthGauge />
          </Safe>
        </div>

        {/* Phase 295 — "טייס פיננסי" is now Home's primary AI hero.
           Promoted from inside "פירוט מתקדם" so the smart Copilot
           narrative reads first, not last. */}
        <div className="sm:col-span-6 empty:hidden">
          <Safe name="CopilotCard">
            <CopilotCard />
          </Safe>
        </div>

        {/* ── HERO — three cards, the only L1 surfaces on first paint.
           Phase 235 trim: HeroEomCard removed because HeroFutureBalance
           covers the same question with a slidable date. Order:
             1. How much can I safely spend? (action)
             2. What's the single most important risk? (signal)
             3. Where will my bank balance be on a future date? (planning) */}
        <div className="sm:col-span-6">
          <Safe name="HeroSpendableCard">
            <HeroSpendableCard />
          </Safe>
        </div>
        <div className="sm:col-span-6">
          <Safe name="HeroInsightCard">
            <HeroInsightCard />
          </Safe>
        </div>
        <div className="sm:col-span-6">
          <Safe name="HeroFutureBalanceCard">
            <HeroFutureBalanceCard />
          </Safe>
        </div>

        {/* Visual separator between hero stack and grouped sections —
           gives the L1 cards breathing room before L2 starts. */}
        <div className="sm:col-span-6 h-1" aria-hidden />

        {/* ── Sections — collapsed by default with a summary chip ──
            Phase 285 — "תזרים עתידי" removed from Home. The full
            forward-looking surfaces (MonthlyCashflowCard,
            LiquidityCurveCard, CashflowBucketsCard,
            UpcomingOutflowsCard, ForecastTimelineCard) all still
            render inside the dedicated "עתידי" tab. Home stays
            focused on today / now / immediate state. */}

        {/* Phase 286 — "כרטיסי אשראי" section removed from Home. The
           CardsHierarchyCard, CardsPressureCard, ActiveInstallmentsCard
           experience still ships inside the "הוצאות" tab. Home stays
           focused on executive overview. */}

        <DashboardSection
          storageKey="simple.obligations"
          title="חיובים קבועים והלוואות"
          subtitle="כל מה שיורד אוטומטית מהבנק כל חודש"
          defaultCollapsed
          summary={summaries?.obligations ?? undefined}
        >
          <div className="sm:col-span-6">
            <Safe name="LoanSummaryCard">
              <LoanSummaryCard />
            </Safe>
          </div>
          <div className="sm:col-span-6">
            <Safe name="HousingCard">
              <HousingCard />
            </Safe>
          </div>
          <div className="sm:col-span-6">
            <Safe name="RecurringCalendarCard">
              <RecurringCalendarCard />
            </Safe>
          </div>
          <div className="sm:col-span-6">
            <Safe name="ObligationsTimelineCard">
              <ObligationsTimelineCard />
            </Safe>
          </div>
        </DashboardSection>

        <DashboardSection
          storageKey="simple.income"
          title="הכנסות"
          subtitle="משכורות, פריסה והכנסה צפויה"
          defaultCollapsed
          summary={summaries?.income ?? undefined}
        >
          <div className="sm:col-span-6">
            <Safe name="IncomeBreakdownCard">
              <IncomeBreakdownCard />
            </Safe>
          </div>
          <div className="sm:col-span-6">
            <Safe name="IncomeForecastCard">
              <IncomeForecastCard />
            </Safe>
          </div>
        </DashboardSection>

        <DashboardSection
          storageKey="simple.analytics"
          title="ניתוחים וסטטיסטיקות"
          subtitle="לאן הולך הכסף — לפי קטגוריה, קצב ומגמה"
          defaultCollapsed
          summary={summaries?.analytics ?? undefined}
        >
          <div className="sm:col-span-6">
            <Safe name="CategorySpendCard">
              <CategorySpendCard />
            </Safe>
          </div>
          <div className="sm:col-span-3">
            <Safe name="CategoryDonut">
              <CategoryDonut />
            </Safe>
          </div>
          <div className="sm:col-span-3">
            <Safe name="HeatmapMini">
              <HeatmapMini />
            </Safe>
          </div>
          <div className="sm:col-span-6">
            <Safe name="CategoryParetoCard">
              <CategoryParetoCard />
            </Safe>
          </div>
          <div className="sm:col-span-6">
            <Safe name="CategoryPaceCard">
              <CategoryPaceCard />
            </Safe>
          </div>
          <div className="sm:col-span-3">
            <Safe name="SpendSplitCard">
              <SpendSplitCard />
            </Safe>
          </div>
          <div className="sm:col-span-3">
            <Safe name="AvgTicketCard">
              <AvgTicketCard />
            </Safe>
          </div>
          <div className="sm:col-span-3">
            <Safe name="WeekendSpendCard">
              <WeekendSpendCard />
            </Safe>
          </div>
          <div className="sm:col-span-3">
            <Safe name="FixedCostRatioCard">
              <FixedCostRatioCard />
            </Safe>
          </div>
          <div className="sm:col-span-6">
            <Safe name="NetWorthCard">
              <NetWorthCard />
            </Safe>
          </div>
          <div className="sm:col-span-6">
            <Safe name="NetWorthTrendCard">
              <NetWorthTrendCard />
            </Safe>
          </div>
          <div className="sm:col-span-6">
            <Safe name="RunwayCard">
              <RunwayCard />
            </Safe>
          </div>
        </DashboardSection>

        <DashboardSection
          storageKey="simple.watch"
          title="בדיקות, מנויים וחריגות"
          subtitle="התראות, מנויים וחריגות"
          defaultCollapsed
          summary={summaries?.watch ?? undefined}
        >
          <div className="sm:col-span-6">
            <Safe name="RiskWarningsCard">
              <RiskWarningsCard />
            </Safe>
          </div>
          <div className="sm:col-span-6">
            <Safe name="AnomalyBanner">
              <AnomalyBanner />
            </Safe>
          </div>
          <div className="sm:col-span-6">
            <Safe name="AnomaliesCard">
              <AnomaliesCard />
            </Safe>
          </div>
          <div className="sm:col-span-6">
            <Safe name="SubscriptionReviewCard">
              <SubscriptionReviewCard />
            </Safe>
          </div>
          <div className="sm:col-span-6">
            <Safe name="SubscriptionRadarCard">
              <SubscriptionRadarCard />
            </Safe>
          </div>
          <div className="sm:col-span-6">
            <Safe name="SmartInsightsCard">
              <SmartInsightsCard />
            </Safe>
          </div>
          <div className="sm:col-span-6">
            <Safe name="SmartRecommendationsCard">
              <SmartRecommendationsCard />
            </Safe>
          </div>
        </DashboardSection>

        {/* Phase 295 — "פירוט מתקדם" removed entirely from Home.
           CopilotCard ("טייס פיננסי") was promoted to the executive
           hero slot at the top of Home (above the hero stack), and
           RecentActivity stays as a single compact preview below.
           Every other card it used to host (HeroEomCard, PulseBar,
           SmartSummaryCard, SpentThisMonthCard, AccountBridgeCard,
           ExpectedBalanceCard, DailyInsightsCard) is a duplicate of
           data already surfaced in Expenses / Future / Insights and
           is no longer mounted on Home. Components remain on disk so
           other tabs that import them keep working. */}
        <div className="sm:col-span-6 empty:hidden">
          <Safe name="RecentActivity">
            <RecentActivity />
          </Safe>
        </div>

        <FloatingCTA onClick={() => setOpen(true)} />

        <ExpenseDialog open={open} onOpenChange={setOpen} />
      </div>
    </SnapshotProvider>
  );
}

function AttentionBanner() {
  const count = useAttentionCount();
  if (count === 0) return null;
  return (
    <fmMotion.button
      type="button"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      onClick={() => {
        hapticTap();
        openAttentionCenter();
      }}
      aria-label={`פתח את מרכז תשומת הלב · ${count} פריטים`}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#FBBF24]/30 bg-[#FBBF24]/8 p-3 text-start transition-colors hover:border-[#FBBF24]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FBBF24]/60"
      style={{
        boxShadow:
          "0 16px 40px -22px rgba(251, 191, 36, 0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#FBBF24]/15 text-[#FBBF24]">
          <BellIcon className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="text-[12px] uppercase tracking-[0.22em] text-[#FBBF24]">
            מרכז תשומת הלב
          </span>
          <span className="text-section text-foreground">
            {count} פריטים דורשים בדיקה
          </span>
        </div>
      </div>
      <ArrowLeftIcon className="size-4 shrink-0 text-[#FBBF24]" aria-hidden />
    </fmMotion.button>
  );
}
