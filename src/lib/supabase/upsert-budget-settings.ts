"use client";

// Phase 274 — single wrapper around `upsertUserSettings` that
// also marks the store's `budgetSettingsCloudAt` when the upsert
// lands. Centralizing the side-effect here means every reconcile
// path in use-cloud-sync + the direct flush helper agree on the
// "pending push cleared" signal.

import { useFinanceStore } from "@/lib/store";
import {
  upsertUserSettings as rawUpsertUserSettings,
  type Status,
} from "@/lib/supabase/cloud-store";

export async function upsertBudgetSettings(args: {
  monthlyBudget: number;
  budgetMode?: "manual" | "auto";
  budgetSafetyBuffer?: number;
  textScale?: "compact" | "normal" | "large";
}): Promise<Status> {
  const res = await rawUpsertUserSettings(args);
  if (res.ok) {
    const now = Date.now();
    useFinanceStore.getState().markBudgetSettingsCloudSynced(now);
    // Phase 288 — only mark the text-scale round-trip when the
    // caller actually sent that field. Avoids falsely claiming
    // cloud agrees with local when only the budget half landed.
    if (args.textScale !== undefined) {
      useFinanceStore.getState().markTextScaleCloudSynced(now);
    }
  }
  return res;
}
