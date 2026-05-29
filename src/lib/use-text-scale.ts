"use client";

// Phase 226 — global text-scale preference.
// Phase 288 — moved into the zustand store so it persists locally
// AND syncs across devices through the same user_settings row that
// holds budget settings. The legacy "sally.text-scale.v1"
// localStorage key is migrated one-shot in the store's v12 → v13
// migrate step.
//
// This hook + `bootstrapTextScale` keep their original API so the
// settings card / data-attribute consumers don't need to change.

import { useEffect } from "react";

import { useFinanceStore } from "@/lib/store";
import { flushBudgetSettings } from "@/lib/budget-settings-flush";

export type TextScale = "compact" | "normal" | "large";

function apply(scale: TextScale): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-text-scale", scale);
}

/** One-shot bootstrap to apply the persisted preference at app
 *  mount. Safe to call from a top-level client component. */
export function bootstrapTextScale(): void {
  if (typeof document === "undefined") return;
  apply(useFinanceStore.getState().textScale);
}

export function useTextScale(): {
  scale: TextScale;
  setScale: (s: TextScale) => void;
} {
  const scale = useFinanceStore((s) => s.textScale);
  const setStoreScale = useFinanceStore((s) => s.setTextScale);

  useEffect(() => {
    apply(scale);
  }, [scale]);

  return {
    scale,
    setScale: (s) => {
      setStoreScale(s);
      // Phase 288 — push the new value to Supabase immediately so
      // reinstall on another device restores it.
      void flushBudgetSettings();
    },
  };
}
