"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useFinanceStore } from "@/lib/store";
import { ErrorBoundary } from "@/components/error-boundary";
import { PulseBar } from "@/components/pulse/pulse-bar";
import { NewExpenseButton } from "@/components/dashboard/new-expense-button";
import { ExpenseDialog } from "@/components/expense-form/expense-dialog";

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

function Safe({ name, children }: { name: string; children: ReactNode }) {
  return <ErrorBoundary name={name}>{children}</ErrorBoundary>;
}

export function DashboardTab() {
  const [open, setOpen] = useState(false);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-6 sm:gap-4">
      <div className="sm:col-span-6">
        <Safe name="HealthScoreCard"><HealthScoreCard /></Safe>
      </div>
      <div className="sm:col-span-6">
        <Safe name="MonthlyDigestCard"><MonthlyDigestCard /></Safe>
      </div>
      <div className="sm:col-span-6">
        <Safe name="PendingTray"><PendingTray /></Safe>
      </div>
      <div className="sm:col-span-6">
        <Safe name="PulseBar"><PulseBar budget={monthlyBudget} /></Safe>
      </div>
      <div className="sm:col-span-3">
        <Safe name="CfoSummary"><CfoSummary /></Safe>
      </div>
      <div className="sm:col-span-3">
        <Safe name="DailyAllowance"><DailyAllowance /></Safe>
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
      <div className="sticky bottom-0 z-30 -mx-5 mt-2 bg-gradient-to-t from-background via-background/95 to-transparent px-5 pb-safe-plus pt-4 sm:static sm:col-span-6 sm:mx-0 sm:bg-none sm:p-0">
        <NewExpenseButton onClick={() => setOpen(true)} />
      </div>
      <ExpenseDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
