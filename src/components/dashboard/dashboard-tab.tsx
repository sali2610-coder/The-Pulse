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

import { HeroSpendableCard } from "@/components/dashboard/simple/hero-spendable-card";
import { HeroEomCard } from "@/components/dashboard/simple/hero-eom-card";
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

// ── Future cash-flow section ──────────────────────────────────────
const LiquidityCurveCard = lazy(() =>
  import("@/components/dashboard/liquidity-curve-card").then((m) => ({
    default:
      m.LiquidityCurveCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const CashflowBucketsCard = lazy(() =>
  import("@/components/dashboard/cashflow-buckets-card").then((m) => ({
    default:
      m.CashflowBucketsCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const MonthlyCashflowCard = lazy(() =>
  import("@/components/dashboard/monthly-cashflow-card").then((m) => ({
    default:
      m.MonthlyCashflowCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const UpcomingOutflowsCard = lazy(() =>
  import("@/components/dashboard/upcoming-outflows-card").then((m) => ({
    default:
      m.UpcomingOutflowsCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const ForecastTimelineCard = lazy(() =>
  import("@/components/dashboard/forecast-timeline-card").then((m) => ({
    default:
      m.ForecastTimelineCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

// ── Credit cards section ──────────────────────────────────────────
const CardsPressureCard = lazy(() =>
  import("@/components/dashboard/cards-pressure-card").then((m) => ({
    default:
      m.CardsPressureCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const CardsHierarchyCard = lazy(() =>
  import("@/components/dashboard/cards-hierarchy-card").then((m) => ({
    default:
      m.CardsHierarchyCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const CategorySpendCard = lazy(() =>
  import("@/components/dashboard/category-spend-card").then((m) => ({
    default:
      m.CategorySpendCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const ActiveInstallmentsCard = lazy(() =>
  import("@/components/dashboard/active-installments-card").then((m) => ({
    default:
      m.ActiveInstallmentsCard as unknown as React.ComponentType<Record<string, unknown>>,
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

// ── Advanced overflow — everything else, collapsed by default ────
const PulseBar = lazy(() =>
  import("@/components/pulse/pulse-bar").then((m) => ({
    default:
      m.PulseBar as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const SmartSummaryCard = lazy(() =>
  import("@/components/dashboard/smart-summary-card").then((m) => ({
    default:
      m.SmartSummaryCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const SpentThisMonthCard = lazy(() =>
  import("@/components/dashboard/spent-this-month-card").then((m) => ({
    default:
      m.SpentThisMonthCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const AccountBridgeCard = lazy(() =>
  import("@/components/dashboard/account-bridge-card").then((m) => ({
    default:
      m.AccountBridgeCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const ExpectedBalanceCard = lazy(() =>
  import("@/components/dashboard/expected-balance-card").then((m) => ({
    default:
      m.ExpectedBalanceCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const TodayPulseCard = lazy(() =>
  import("@/components/dashboard/today-pulse-card").then((m) => ({
    default:
      m.TodayPulseCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const DailyInsightsCard = lazy(() =>
  import("@/components/dashboard/daily-insights-card").then((m) => ({
    default:
      m.DailyInsightsCard as unknown as React.ComponentType<Record<string, unknown>>,
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

        {/* Phase 275 — "הפעימה של היום" lifted to the very top of
           Home above the hero stack. It's emotionally powerful and
           sets the day's tone before any numbers. */}
        <div className="sm:col-span-6 empty:hidden">
          <Safe name="TodayPulseCard">
            <TodayPulseCard />
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

        {/* ── Sections — collapsed by default with a summary chip ── */}
        <DashboardSection
          storageKey="simple.future"
          title="תזרים עתידי"
          subtitle="חיובים שיגיעו, יציאות צפויות, ומה ייכנס לבנק"
          defaultCollapsed
          summary={summaries?.future ?? undefined}
        >
          {/* Phase 268 — month-first cashflow folders. June + July
             never visually merged into one scary block. */}
          <div className="sm:col-span-6">
            <Safe name="MonthlyCashflowCard">
              <MonthlyCashflowCard />
            </Safe>
          </div>
          <div className="sm:col-span-6">
            <Safe name="LiquidityCurveCard">
              <LiquidityCurveCard />
            </Safe>
          </div>
          <div className="sm:col-span-6">
            <Safe name="CashflowBucketsCard">
              <CashflowBucketsCard />
            </Safe>
          </div>
          <div className="sm:col-span-6">
            <Safe name="UpcomingOutflowsCard">
              <UpcomingOutflowsCard />
            </Safe>
          </div>
          <div className="sm:col-span-6">
            <Safe name="ForecastTimelineCard">
              <ForecastTimelineCard />
            </Safe>
          </div>
        </DashboardSection>

        <DashboardSection
          storageKey="simple.cards"
          title="כרטיסי אשראי"
          subtitle="כל כרטיס בנפרד · קטגוריה · קבוע / תשלום / חד-פעמי"
          defaultCollapsed
          summary={summaries?.cards ?? undefined}
        >
          <div className="sm:col-span-6">
            <Safe name="CardsHierarchyCard">
              <CardsHierarchyCard />
            </Safe>
          </div>
          <div className="sm:col-span-6">
            <Safe name="CardsPressureCard">
              <CardsPressureCard />
            </Safe>
          </div>
          <div className="sm:col-span-6">
            <Safe name="ActiveInstallmentsCard">
              <ActiveInstallmentsCard />
            </Safe>
          </div>
        </DashboardSection>

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

        <DashboardSection
          storageKey="simple.advanced"
          title="פירוט מתקדם"
          subtitle="Pulse, CFO ונתונים נוספים"
          defaultCollapsed
        >
          <div className="sm:col-span-6">
            <Safe name="HeroEomCard">
              <HeroEomCard />
            </Safe>
          </div>
          <div className="sm:col-span-6">
            <Safe name="PulseBar">
              <PulseBar budget={pulseBudget} />
            </Safe>
          </div>
          <div className="sm:col-span-6">
            <Safe name="SmartSummaryCard">
              <SmartSummaryCard />
            </Safe>
          </div>
          <div className="sm:col-span-6">
            <Safe name="SpentThisMonthCard">
              <SpentThisMonthCard />
            </Safe>
          </div>
          <div className="sm:col-span-6">
            <Safe name="AccountBridgeCard">
              <AccountBridgeCard />
            </Safe>
          </div>
          <div className="sm:col-span-6">
            <Safe name="ExpectedBalanceCard">
              <ExpectedBalanceCard />
            </Safe>
          </div>
          {/* Phase 275 — CfoSummary, HealthScoreCard, LiquidityTimelineCard
              relocated to the Expenses tab as the financial-control
              center. WhatIfSimulatorCard promoted into the AI Insights
              tab as the CFO Sandbox. TodayPulseCard moved to the top
              of Home for emotional anchoring. */}
          <div className="sm:col-span-6">
            {/* Phase 277 — monthly summary / deficit / EOM forecast
               surfaces (CashflowSummaryCard, StatsCards, EmergencyFundCard,
               AnchorTrajectoryCard, MonthlyDigestCard) moved into the
               AI Insights tab as the connected financial-narrative
               experience. Home keeps lighter, daily-cadence cards. */}
            <Safe name="DailyInsightsCard">
              <DailyInsightsCard />
            </Safe>
          </div>
          <div className="sm:col-span-6">
            <Safe name="RecentActivity">
              <RecentActivity />
            </Safe>
          </div>
          <div className="sm:col-span-6">
            <Safe name="CopilotCard">
              <CopilotCard />
            </Safe>
          </div>
        </DashboardSection>

        <FloatingCTA onClick={() => setOpen(true)} />

        <ExpenseDialog open={open} onOpenChange={setOpen} />
      </div>
    </SnapshotProvider>
  );
}
