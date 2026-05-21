"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useFinanceStore } from "@/lib/store";
import { ErrorBoundary } from "@/components/error-boundary";
import { PulseBar } from "@/components/pulse/pulse-bar";
import { FloatingCTA } from "@/components/dashboard/floating-cta";
import { ExpenseDialog } from "@/components/expense-form/expense-dialog";
import { SnapshotProvider } from "@/lib/snapshot-context";

// Every dashboard card except the always-needed PulseBar + NewExpenseButton
// is dynamically imported with `ssr: false`. iPhone Safari was rejecting `/`
// with "This page couldn't load" — most likely a memory exhaustion as 19
// cards with Framer Motion + SVG raced to mount at once. Lazy loading lets
// the renderer mount them one at a time as their chunks resolve.
//
// Each card is wrapped in an ErrorBoundary so a single crash doesn't take
// the whole page down — the offender silently falls back to `null` while
// every other tile keeps rendering.

const lazy = (loader: () => Promise<{ default: React.ComponentType<Record<string, unknown>> }>) =>
  dynamic(loader, { ssr: false });

const TimelineSync = lazy(() =>
  import("@/components/pulse/timeline-sync").then((m) => ({
    default: m.TimelineSync as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const DailyAllowance = lazy(() =>
  import("@/components/dashboard/daily-allowance").then((m) => ({
    default: m.DailyAllowance as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const CfoSummary = lazy(() =>
  import("@/components/dashboard/cfo-summary").then((m) => ({
    default: m.CfoSummary as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const StatsCards = lazy(() =>
  import("@/components/dashboard/stats-cards").then((m) => ({
    default: m.StatsCards as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const UpcomingExpenses = lazy(() =>
  import("@/components/dashboard/upcoming-expenses").then((m) => ({
    default: m.UpcomingExpenses as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const PendingTray = lazy(() =>
  import("@/components/dashboard/pending-tray").then((m) => ({
    default: m.PendingTray as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const CategoryDonut = lazy(() =>
  import("@/components/dashboard/category-donut").then((m) => ({
    default: m.CategoryDonut as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const HeatmapMini = lazy(() =>
  import("@/components/dashboard/heatmap-mini").then((m) => ({
    default: m.HeatmapMini as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const BalanceForecastCard = lazy(() =>
  import("@/components/dashboard/balance-forecast-card").then((m) => ({
    default: m.BalanceForecastCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const BalanceHorizonCard = lazy(() =>
  import("@/components/dashboard/balance-horizon-card").then((m) => ({
    default: m.BalanceHorizonCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const AccountForecastCard = lazy(() =>
  import("@/components/dashboard/account-forecast-card").then((m) => ({
    default: m.AccountForecastCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const ActiveInstallmentsCard = lazy(() =>
  import("@/components/dashboard/active-installments-card").then((m) => ({
    default: m.ActiveInstallmentsCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const FuturePressureCard = lazy(() =>
  import("@/components/dashboard/future-pressure-card").then((m) => ({
    default: m.FuturePressureCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const SubscriptionRadarCard = lazy(() =>
  import("@/components/dashboard/subscription-radar-card").then((m) => ({
    default: m.SubscriptionRadarCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const AnomaliesCard = lazy(() =>
  import("@/components/dashboard/anomalies-card").then((m) => ({
    default: m.AnomaliesCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const MonthlyDigestCard = lazy(() =>
  import("@/components/dashboard/monthly-digest-card").then((m) => ({
    default: m.MonthlyDigestCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const HealthScoreCard = lazy(() =>
  import("@/components/dashboard/health-score-card").then((m) => ({
    default: m.HealthScoreCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const RecentActivity = lazy(() =>
  import("@/components/dashboard/recent-activity").then((m) => ({
    default: m.RecentActivity as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

const CashflowTimeline = lazy(() =>
  import("@/components/dashboard/cashflow-timeline").then((m) => ({
    default: m.CashflowTimeline as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

const SmartSummaryCard = lazy(() =>
  import("@/components/dashboard/smart-summary-card").then((m) => ({
    default: m.SmartSummaryCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

const CopilotCard = lazy(() =>
  import("@/components/dashboard/copilot-card").then((m) => ({
    default: m.CopilotCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

const WelcomeSetupCard = lazy(() =>
  import("@/components/dashboard/welcome-setup-card").then((m) => ({
    default: m.WelcomeSetupCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

const CardsPressureCard = lazy(() =>
  import("@/components/dashboard/cards-pressure-card").then((m) => ({
    default: m.CardsPressureCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

const HousingCard = lazy(() =>
  import("@/components/dashboard/housing-card").then((m) => ({
    default: m.HousingCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

const CashflowSummaryCard = lazy(() =>
  import("@/components/dashboard/cashflow-summary-card").then((m) => ({
    default: m.CashflowSummaryCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

const AnomalyBanner = lazy(() =>
  import("@/components/dashboard/anomaly-banner").then((m) => ({
    default: m.AnomalyBanner as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

const MonthDeltaCard = lazy(() =>
  import("@/components/dashboard/month-delta-card").then((m) => ({
    default: m.MonthDeltaCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

const UpcomingDebitsBanner = lazy(() =>
  import("@/components/dashboard/upcoming-debits-banner").then((m) => ({
    default: m.UpcomingDebitsBanner as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

const CashflowTrendCard = lazy(() =>
  import("@/components/dashboard/cashflow-trend-card").then((m) => ({
    default: m.CashflowTrendCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

const SmartInsightsCard = lazy(() =>
  import("@/components/dashboard/smart-insights-card").then((m) => ({
    default: m.SmartInsightsCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

function Safe({ name, children }: { name: string; children: ReactNode }) {
  return <ErrorBoundary name={name}>{children}</ErrorBoundary>;
}

export function DashboardTab() {
  const [open, setOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  return (
   <SnapshotProvider>
    <div className="grid grid-cols-1 gap-2.5 pb-28 sm:grid-cols-6 sm:gap-3 sm:pb-32">
      {/* WELCOME / SETUP — calm onboarding card; vanishes when done. */}
      <div className="sm:col-span-6">
        <Safe name="WelcomeSetupCard"><WelcomeSetupCard /></Safe>
      </div>

      {/* SMART SUMMARY — one-line story of the user's financial state. */}
      <div className="sm:col-span-6">
        <Safe name="SmartSummaryCard"><SmartSummaryCard /></Safe>
      </div>

      {/* UPCOMING CARD DEBITS — heads-up before the bank pulls. */}
      <div className="sm:col-span-6">
        <Safe name="UpcomingDebitsBanner"><UpcomingDebitsBanner /></Safe>
      </div>

      {/* ANOMALY BANNER — category spend spikes vs 3-month baseline. */}
      <div className="sm:col-span-6">
        <Safe name="AnomalyBanner"><AnomalyBanner /></Safe>
      </div>

      {/* MONTH-OVER-MONTH DELTA — net change + top grew/shrunk. */}
      <div className="sm:col-span-6">
        <Safe name="MonthDeltaCard"><MonthDeltaCard /></Safe>
      </div>

      {/* CASHFLOW TREND — 6-month income-vs-expense sparkline. */}
      <div className="sm:col-span-6">
        <Safe name="CashflowTrendCard"><CashflowTrendCard /></Safe>
      </div>

      {/* SMART INSIGHTS DIGEST — chip strip of pending detectors. */}
      <div className="sm:col-span-6">
        <Safe name="SmartInsightsCard"><SmartInsightsCard /></Safe>
      </div>

      {/* COPILOT — forward-looking proactive insights */}
      <div className="sm:col-span-6">
        <Safe name="CopilotCard"><CopilotCard /></Safe>
      </div>

      {/* HERO — primary state + projection */}
      <div className="sm:col-span-6">
        <Safe name="PulseBar"><PulseBar budget={monthlyBudget} /></Safe>
      </div>
      <div className="sm:col-span-6">
        <Safe name="CashflowSummaryCard"><CashflowSummaryCard /></Safe>
      </div>

      {/* PRIMARY ACTIONS — pending review + live activity feed. */}
      <div className="sm:col-span-6">
        <Safe name="PendingTray"><PendingTray /></Safe>
      </div>
      <div className="sm:col-span-6">
        <Safe name="RecentActivity"><RecentActivity /></Safe>
      </div>

      {/* CARDS PRESSURE — per-card monthly load */}
      <div className="sm:col-span-6">
        <Safe name="CardsPressureCard"><CardsPressureCard /></Safe>
      </div>

      {/* HOUSING — living-cost bucket */}
      <div className="sm:col-span-6">
        <Safe name="HousingCard"><HousingCard /></Safe>
      </div>

      {/* CASHFLOW TIMELINE — day-by-day projected events */}
      <div className="sm:col-span-6">
        <Safe name="CashflowTimeline"><CashflowTimeline /></Safe>
      </div>

      {/* QUICK DAILY GLANCE — split row */}
      <div className="sm:col-span-3">
        <Safe name="DailyAllowance"><DailyAllowance /></Safe>
      </div>
      <div className="sm:col-span-3">
        <Safe name="CfoSummary"><CfoSummary /></Safe>
      </div>

      {/* MONTHLY DIGEST — narrative summary stays in the main flow */}
      <div className="sm:col-span-6">
        <Safe name="MonthlyDigestCard"><MonthlyDigestCard /></Safe>
      </div>

      {/* Floating CTA — fixed dock, auto-hides on scroll-down. */}
      <FloatingCTA onClick={() => setOpen(true)} />

      {/* ADVANCED — collapsed by default so the hero breathes. */}
      <div className="sm:col-span-6">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-2xl border border-white/8 bg-surface/40 px-4 py-3 text-[12px] text-muted-foreground transition-colors hover:border-white/16 hover:text-foreground"
          aria-expanded={advancedOpen}
        >
          <span className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-[0.22em]">
              נתונים מתקדמים
            </span>
            <span className="text-[10px] text-muted-foreground/70">
              {advancedOpen ? "סגור" : "פתח"}
            </span>
          </span>
          <motion.span
            animate={{ rotate: advancedOpen ? 180 : 0 }}
            transition={{ duration: 0.22 }}
            className="text-muted-foreground"
          >
            ▾
          </motion.span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {advancedOpen ? (
          <motion.div
            key="advanced"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="sm:col-span-6 grid grid-cols-1 gap-2.5 overflow-hidden sm:grid-cols-6 sm:gap-3"
          >
            <div className="sm:col-span-6">
              <Safe name="HealthScoreCard"><HealthScoreCard /></Safe>
            </div>
            <div className="sm:col-span-6">
              <Safe name="BalanceForecastCard"><BalanceForecastCard /></Safe>
            </div>
            <div className="sm:col-span-6">
              <Safe name="BalanceHorizonCard"><BalanceHorizonCard /></Safe>
            </div>
            <div className="sm:col-span-6">
              <Safe name="AccountForecastCard"><AccountForecastCard /></Safe>
            </div>
            <div className="sm:col-span-6">
              <Safe name="StatsCards"><StatsCards /></Safe>
            </div>
            <div className="sm:col-span-6">
              <Safe name="AnomaliesCard"><AnomaliesCard /></Safe>
            </div>
            <div className="sm:col-span-6">
              <Safe name="SubscriptionRadarCard"><SubscriptionRadarCard /></Safe>
            </div>
            <div className="sm:col-span-3">
              <Safe name="ActiveInstallmentsCard"><ActiveInstallmentsCard /></Safe>
            </div>
            <div className="sm:col-span-3">
              <Safe name="FuturePressureCard"><FuturePressureCard /></Safe>
            </div>
            <div className="sm:col-span-3">
              <Safe name="CategoryDonut"><CategoryDonut /></Safe>
            </div>
            <div className="sm:col-span-3">
              <Safe name="HeatmapMini"><HeatmapMini /></Safe>
            </div>
            <div className="sm:col-span-6">
              <Safe name="TimelineSync"><TimelineSync budget={monthlyBudget} /></Safe>
            </div>
            <div className="sm:col-span-6">
              <Safe name="UpcomingExpenses"><UpcomingExpenses /></Safe>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <ExpenseDialog open={open} onOpenChange={setOpen} />
    </div>
   </SnapshotProvider>
  );
}
