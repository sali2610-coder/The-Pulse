"use client";

import { BudgetInput } from "./budget-input";
import { RecurringRulesPanel } from "@/components/recurring/recurring-rules-panel";

export function SettingsTab() {
  return (
    <div className="flex flex-col gap-4">
      <BudgetInput />
      <RecurringRulesPanel />
    </div>
  );
}
