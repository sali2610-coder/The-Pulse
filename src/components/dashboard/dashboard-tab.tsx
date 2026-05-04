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
import { ExpenseDialog } from "@/components/expense-form/expense-dialog";

export function DashboardTab() {
  const [open, setOpen] = useState(false);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-6 sm:gap-4">
      {/* Hero — full width */}
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

      {/* Timeline — full width */}
      <div className="sm:col-span-6">
        <TimelineSync budget={monthlyBudget} />
      </div>

      {/* Stats — full width grid that already uses 2 columns internally */}
      <div className="sm:col-span-6">
        <StatsCards />
      </div>

      {/* Action — full width */}
      <div className="sm:col-span-6">
        <NewExpenseButton onClick={() => setOpen(true)} />
      </div>

      {/* Upcoming — full width */}
      <div className="sm:col-span-6">
        <UpcomingExpenses />
      </div>

      <ExpenseDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
