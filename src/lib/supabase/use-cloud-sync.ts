"use client";

// Cloud hydration + write loop.
//
// Activation rules (all must hold or every effect is a no-op):
//   1. Supabase env vars present (NEXT_PUBLIC_SUPABASE_URL + ANON_KEY).
//   2. The user has a Supabase session (signed in via Google through
//      `signInWithGoogle` in supabase/auth.ts).
//   3. Zustand persist has hydrated locally (`hasHydrated === true`).
//
// On first satisfying tick:
//   • verifyCloudAccess() runs to confirm every table is reachable
//     under RLS.
//   • fetchAllEntities() pulls the cloud snapshot.
//   • Compare cloud richness vs local richness:
//       cloudR > localR        → apply cloud over local (safety
//                                snapshot taken first).
//       cloudR === localR > 0  → no-op (already in sync).
//       cloudR < localR        → DO NOT apply. Instead push local up
//                                via pushAllEntities so cloud catches
//                                up. Empty-cloud-overwriting-rich-local
//                                is exactly the vector we're guarding
//                                against.
//       both empty             → no-op.
//
// After hydration, a debounced subscriber pushes any store mutation up
// to cloud via per-entity upsert. The mutation-queue persists writes
// so an offline session catches up on the next focus/online event.

import { useEffect, useRef, useState } from "react";

import { useFinanceStore } from "@/lib/store";
import {
  captureSafetyBackup,
  richness,
  type SafetyPayload,
} from "@/lib/local-safety-snapshots";
import {
  fetchAllEntities,
  pushAllEntities,
  upsertAccount,
  upsertEntry,
  upsertIncome,
  upsertLoan,
  upsertRule,
  verifyCloudAccess,
} from "./cloud-store";
import { getCurrentSession, onAuthStateChange } from "./auth";
import { isSupabaseConfigured } from "./client";

export type CloudSyncState = {
  configured: boolean;
  authenticated: boolean;
  hydrating: boolean;
  hydrated: boolean;
  cloudUserId: string | null;
  lastSyncAt: number | null;
  cloudCounts: {
    entries: number;
    accounts: number;
    rules: number;
    loans: number;
    incomes: number;
  } | null;
  lastError: string | null;
  rlsOk: boolean | null;
};

const INITIAL: CloudSyncState = {
  configured: false,
  authenticated: false,
  hydrating: false,
  hydrated: false,
  cloudUserId: null,
  lastSyncAt: null,
  cloudCounts: null,
  lastError: null,
  rlsOk: null,
};

function snapshotLocal(): SafetyPayload {
  const s = useFinanceStore.getState();
  return {
    entries: s.entries,
    rules: s.rules,
    statuses: s.statuses,
    accounts: s.accounts,
    loans: s.loans,
    incomes: s.incomes,
    monthlyBudget: s.monthlyBudget,
    lastSyncedAt: s.lastSyncedAt,
    audioEnabled: s.audioEnabled,
  };
}

function localEntityRichness(): number {
  // Excludes monthlyBudget — that field lives in KV-state, not in
  // Supabase tables, so it would skew the entity-only reconcile.
  const s = useFinanceStore.getState();
  return richness({
    entries: s.entries.length,
    rules: s.rules.length,
    accounts: s.accounts.length,
    loans: s.loans.length,
    incomes: s.incomes.length,
    monthlyBudget: 0,
  });
}

export function useCloudSync(): CloudSyncState {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const [state, setState] = useState<CloudSyncState>(INITIAL);
  const hydrationRanRef = useRef(false);

  // ── Authentication watch ───────────────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setState((s) => ({ ...s, configured: false }));
      return;
    }
    setState((s) => ({ ...s, configured: true }));
    let cancelled = false;
    (async () => {
      const session = await getCurrentSession();
      if (cancelled) return;
      setState((s) => ({
        ...s,
        authenticated: Boolean(session),
        cloudUserId: session?.userId ?? null,
      }));
    })();
    const unsub = onAuthStateChange((session) => {
      setState((s) => ({
        ...s,
        authenticated: Boolean(session),
        cloudUserId: session?.userId ?? null,
        // Reset hydration ref so a fresh sign-in re-pulls.
        hydrated: session ? s.hydrated : false,
      }));
      if (!session) hydrationRanRef.current = false;
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  // ── Hydration: one-shot per authenticated session ──────────────────
  useEffect(() => {
    if (!hydrated) return;
    if (!state.configured || !state.authenticated) return;
    if (hydrationRanRef.current) return;
    hydrationRanRef.current = true;

    let cancelled = false;
    (async () => {
      setState((s) => ({ ...s, hydrating: true, lastError: null }));
      // 1. Verify schema + RLS.
      const health = await verifyCloudAccess();
      if (cancelled) return;
      if (!health.allOk) {
        setState((s) => ({
          ...s,
          hydrating: false,
          rlsOk: false,
          lastError: "cloud_unreachable",
        }));
        return;
      }
      setState((s) => ({ ...s, rlsOk: true }));

      // 2. Pull all entities.
      const result = await fetchAllEntities();
      if (cancelled) return;
      if (!result.ok) {
        setState((s) => ({
          ...s,
          hydrating: false,
          lastError: result.detail ?? result.reason,
        }));
        return;
      }
      const cloud = result.data;
      const cloudR = richness({
        entries: cloud.entries.length,
        rules: cloud.rules.length,
        accounts: cloud.accounts.length,
        loans: cloud.loans.length,
        incomes: cloud.incomes.length,
        monthlyBudget: 0,
      });
      const localR = localEntityRichness();

      // 3. Reconcile.
      if (cloudR > localR) {
        // Cloud richer → apply over local, but capture safety first.
        captureSafetyBackup("pre-remote-apply", snapshotLocal());
        const api = useFinanceStore.setState as (
          partial: Partial<ReturnType<typeof useFinanceStore.getState>>,
        ) => void;
        api({
          entries: cloud.entries,
          rules: cloud.rules,
          accounts: cloud.accounts,
          loans: cloud.loans,
          incomes: cloud.incomes,
        });
      } else if (cloudR < localR) {
        // Local richer → push local up. Never let an empty cloud
        // overwrite rich local; the inverse is exactly what we ship
        // up here.
        await pushAllEntities({
          entries: useFinanceStore.getState().entries,
          rules: useFinanceStore.getState().rules,
          accounts: useFinanceStore.getState().accounts,
          loans: useFinanceStore.getState().loans,
          incomes: useFinanceStore.getState().incomes,
        });
      }
      // cloudR === localR: leave both alone.

      setState((s) => ({
        ...s,
        hydrating: false,
        hydrated: true,
        lastSyncAt: Date.now(),
        cloudCounts: {
          entries: cloud.entries.length,
          accounts: cloud.accounts.length,
          rules: cloud.rules.length,
          loans: cloud.loans.length,
          incomes: cloud.incomes.length,
        },
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, state.configured, state.authenticated]);

  // ── Write loop: push store mutations up ────────────────────────────
  // Subscribes once after hydration. Fires on every store change
  // with a 1.5s debounce. Only pushes ENTITIES that actually changed
  // (shallow id-keyed diff).
  useEffect(() => {
    if (!state.hydrated) return;
    if (!state.authenticated) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastSnap = {
      entries: useFinanceStore.getState().entries,
      rules: useFinanceStore.getState().rules,
      accounts: useFinanceStore.getState().accounts,
      loans: useFinanceStore.getState().loans,
      incomes: useFinanceStore.getState().incomes,
    };

    const unsub = useFinanceStore.subscribe((s) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        const next = {
          entries: s.entries,
          rules: s.rules,
          accounts: s.accounts,
          loans: s.loans,
          incomes: s.incomes,
        };

        // Compute added/updated rows by reference-inequality on each
        // entity. New ids OR updated row identities trigger an upsert.
        const upsertChanged = async <T extends { id: string }>(
          prev: T[],
          curr: T[],
          fn: (item: T) => Promise<unknown>,
        ) => {
          const prevById = new Map(prev.map((p) => [p.id, p] as const));
          for (const item of curr) {
            const old = prevById.get(item.id);
            if (old !== item) {
              // Includes both add (no prev) and update (different ref).
              await fn(item);
            }
          }
        };
        try {
          await upsertChanged(lastSnap.accounts, next.accounts, upsertAccount);
          await upsertChanged(lastSnap.rules, next.rules, upsertRule);
          await upsertChanged(lastSnap.loans, next.loans, upsertLoan);
          await upsertChanged(lastSnap.incomes, next.incomes, upsertIncome);
          await upsertChanged(lastSnap.entries, next.entries, upsertEntry);
          lastSnap = next;
          setState((cur) => ({ ...cur, lastSyncAt: Date.now() }));
        } catch (err) {
          setState((cur) => ({
            ...cur,
            lastError: err instanceof Error ? err.message : "sync_failed",
          }));
        }
      }, 1500);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [state.hydrated, state.authenticated]);

  return state;
}
