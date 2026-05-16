"use client";

import { CashVsCredit } from "./cash-vs-credit";
import { CashCreditTrend } from "./cash-credit-trend";
import { CategoryBreakdown } from "./category-breakdown";
import { DayOfWeekHeatmap } from "./day-of-week-heatmap";

export function AnalyticsTab() {
  return (
    <div className="flex flex-col gap-4">
      <CashVsCredit />
      <CashCreditTrend />
      <DayOfWeekHeatmap />
      <CategoryBreakdown />
    </div>
  );
}
