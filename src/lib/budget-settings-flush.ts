"use client";

// Phase 267 — direct-push for budget settings.
//
// Phase 263's reinstall fix relied on the debounced subscribe loop
// (1.5 s) in useCloudSync to mirror local budget changes up to
// Supabase. That window leaks: if the user toggles Auto and closes
// the PWA inside 1.5 s, the cloud push never fires and a future
// reinstall reads back the stale "manual 7000" row.
//
// This helper bypasses the debounce. Any UI that mutates a budget
// setting (BudgetInput) should call `flushBudgetSettings()`
// immediately after the store mutation — the upsert lands as
// soon as the network permits.
//
// Fire-and-forget. Errors surface via `onError` so the UI can warn
// when Supabase rejects the write (legacy schema with no
// budget_mode column, RLS error, no session).

import { useFinanceStore } from "@/lib/store";
import { upsertUserSettings } from "@/lib/supabase/cloud-store";

export type FlushResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_configured" | "no_session" | "rls" | "unknown";
      detail?: string;
    };

let inFlight: Promise<FlushResult> | null = null;

export function flushBudgetSettings(): Promise<FlushResult> {
  // Single-flight: collapse rapid taps (Auto → Manual → Auto) into
  // one in-flight upsert at a time. New requests await the same
  // promise; the next call after it settles will pick up the
  // latest store state.
  if (inFlight) return inFlight;
  const s = useFinanceStore.getState();
  const payload = {
    monthlyBudget: s.monthlyBudget,
    budgetMode: s.budgetMode,
    budgetSafetyBuffer: s.budgetSafetyBuffer,
  };
  inFlight = (async (): Promise<FlushResult> => {
    try {
      const res = await upsertUserSettings(payload);
      if (res.ok) return { ok: true };
      return {
        ok: false,
        reason: res.reason,
        detail: res.detail,
      };
    } catch (e) {
      return {
        ok: false,
        reason: "unknown",
        detail: e instanceof Error ? e.message : String(e),
      };
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
