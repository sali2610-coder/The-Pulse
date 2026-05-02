"use client";

import { CashVsCredit } from "./cash-vs-credit";
import { CategoryBreakdown } from "./category-breakdown";

export function AnalyticsTab() {
  return (
    <div className="flex flex-col gap-4">
      <CashVsCredit />
      <CategoryBreakdown />
    </div>
  );
}
