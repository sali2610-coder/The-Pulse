"use client";

import { CashVsCredit } from "./cash-vs-credit";
import { CashCreditTrend } from "./cash-credit-trend";
import { CategoryBreakdown } from "./category-breakdown";

export function AnalyticsTab() {
  return (
    <div className="flex flex-col gap-4">
      <CashVsCredit />
      <CashCreditTrend />
      <CategoryBreakdown />
    </div>
  );
}
