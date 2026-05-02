"use client";

import { useState } from "react";
import { useFinanceStore } from "@/lib/store";
import { PulseBar } from "@/components/pulse/pulse-bar";
import { TimelineSync } from "@/components/pulse/timeline-sync";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { NewExpenseButton } from "@/components/dashboard/new-expense-button";
import { UpcomingExpenses } from "@/components/dashboard/upcoming-expenses";
import { ExpenseDialog } from "@/components/expense-form/expense-dialog";

export function DashboardTab() {
  const [open, setOpen] = useState(false);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  return (
    <div className="flex flex-col gap-4">
      <PulseBar budget={monthlyBudget} />
      <TimelineSync budget={monthlyBudget} />
      <StatsCards />
      <NewExpenseButton onClick={() => setOpen(true)} />
      <UpcomingExpenses />
      <ExpenseDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
