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
}): Promise<Status> {
  const res = await rawUpsertUserSettings(args);
  if (res.ok) {
    useFinanceStore.getState().markBudgetSettingsCloudSynced(Date.now());
  }
  return res;
}
