"use client";

import { MonthOverMonth } from "./month-over-month";
import { CategoryTrendsCard } from "./category-trends";
import { EntrySearchCard } from "./entry-search-card";

export function HistoryTab() {
  return (
    <div className="flex flex-col gap-4">
      <EntrySearchCard />
      <MonthOverMonth />
      <CategoryTrendsCard />
    </div>
  );
}
