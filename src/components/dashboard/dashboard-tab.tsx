"use client";

import { useState } from "react";
import { useFinanceStore } from "@/lib/store";
import { PulseBar } from "@/components/pulse/pulse-bar";
import { TimelineSync } from "@/components/pulse/timeline-sync";
import { DailyAllowance } from "@/components/dashboard/daily-allowance";
import { CfoSummary } from "@/components/dashboard/cfo-summary";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { NewExpenseButton } from "@/components/dashboard/new-expense-button";
import { UpcomingExpenses } from "@/components/dashboard/upcoming-expenses";
import { PendingTray } from "@/components/dashboard/pending-tray";
import { CategoryDonut } from "@/components/dashboard/category-donut";
import { HeatmapMini } from "@/components/dashboard/heatmap-mini";
import { BalanceForecastCard } from "@/components/dashboard/balance-forecast-card";
import { ActiveInstallmentsCard } from "@/components/dashboard/active-installments-card";
import { FuturePressureCard } from "@/components/dashboard/future-pressure-card";
import { SubscriptionRadarCard } from "@/components/dashboard/subscription-radar-card";
import { AnomaliesCard } from "@/components/dashboard/anomalies-card";
import { ExpenseDialog } from "@/components/expense-form/expense-dialog";

export function DashboardTab() {
  const [open, setOpen] = useState(false);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-6 sm:gap-4">
      {/* Pending tray — hero priority, rendered above the pulse when items
          exist so the user sees it first thing. */}
      <div className="sm:col-span-6">
        <PendingTray />
      </div>

      {/* The Pulse hero bar */}
      <div className="sm:col-span-6">
        <PulseBar budget={monthlyBudget} />
      </div>

      {/* CFO + Daily allowance — paired half-width on >sm */}
      <div className="sm:col-span-3">
        <CfoSummary />
      </div>
      <div className="sm:col-span-3">
        <DailyAllowance />
      </div>

      {/* Balance trajectory — full-width sparkline + overdraft warning */}
      <div className="sm:col-span-6">
        <BalanceForecastCard />
      </div>

      {/* Stats — full width grid that already uses 2 columns internally */}
      <div className="sm:col-span-6">
        <StatsCards />
      </div>

      {/* Anomalies — surfaces this-month outliers vs per-merchant baseline */}
      <div className="sm:col-span-6">
        <AnomaliesCard />
      </div>

      {/* Subscription radar — surfaces auto-detected patterns */}
      <div className="sm:col-span-6">
        <SubscriptionRadarCard />
      </div>

      {/* Installments + future pressure — paired (gold + neon) */}
      <div className="sm:col-span-3">
        <ActiveInstallmentsCard />
      </div>
      <div className="sm:col-span-3">
        <FuturePressureCard />
      </div>

      {/* Charts — donut + heatmap */}
      <div className="sm:col-span-3">
        <CategoryDonut />
      </div>
      <div className="sm:col-span-3">
        <HeatmapMini />
      </div>

      {/* Timeline — full width */}
      <div className="sm:col-span-6">
        <TimelineSync budget={monthlyBudget} />
      </div>

      {/* Upcoming — full width */}
      <div className="sm:col-span-6">
        <UpcomingExpenses />
      </div>

      {/* Sticky action — full width on mobile, normal flow on desktop */}
      <div className="sticky bottom-0 z-30 -mx-5 mt-2 bg-gradient-to-t from-background via-background/95 to-transparent px-5 pb-safe-plus pt-4 sm:static sm:col-span-6 sm:mx-0 sm:bg-none sm:p-0">
        <NewExpenseButton onClick={() => setOpen(true)} />
      </div>

      <ExpenseDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
