"use client";

import { MonthOverMonth } from "./month-over-month";
import { CategoryTrendsCard } from "./category-trends";

export function HistoryTab() {
  return (
    <div className="flex flex-col gap-4">
      <MonthOverMonth />
      <CategoryTrendsCard />
    </div>
  );
}
