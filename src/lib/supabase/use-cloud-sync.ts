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
  readCacheOwner,
  richness,
  writeCacheOwner,
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
  /** True once the FIRST `getCurrentSession()` round-trip has
   *  resolved. Lets the dashboard render a curtain until we know
   *  who's signed in — prevents USER_A's cached data from flashing
   *  on USER_B's screen during the boot race. */
  verified: boolean;
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
  /** When true, the next hydration MUST apply cloud unconditionally
   *  (don't push local up — local belongs to a previous owner). */
  ownershipMismatch: boolean;
};

const INITIAL: CloudSyncState = {
  configured: false,
  verified: false,
  authenticated: false,
  hydrating: false,
  hydrated: false,
  cloudUserId: null,
  lastSyncAt: null,
  cloudCounts: null,
  lastError: null,
  rlsOk: null,
  ownershipMismatch: false,
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

/** Reset every entity slice + monthlyBudget in the live Zustand store.
 *  Used when we detect that the local cache belongs to a DIFFERENT
 *  Supabase user than the one currently signed in — preserving the
 *  cache would leak USER_A's data into USER_B's screen. The safety
 *  snapshot is captured by the caller BEFORE this is invoked. */
function wipeLocalStoreToEmpty(): void {
  const api = useFinanceStore.setState as (
    partial: Partial<ReturnType<typeof useFinanceStore.getState>>,
  ) => void;
  api({
    entries: [],
    rules: [],
    statuses: [],
    accounts: [],
    loans: [],
    incomes: [],
    monthlyBudget: 0,
    lastSyncedAt: 0,
  });
}

export function useCloudSync(): CloudSyncState {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const [state, setState] = useState<CloudSyncState>(INITIAL);
  const hydrationRanRef = useRef(false);
  // Mirror of state.ownershipMismatch so the hydration effect can read
  // the latest value without taking a dependency on it — keeping it in
  // the dep array would re-fire the effect on every reconcile.
  const ownershipMismatchRef = useRef(false);

  // ── Authentication watch + cache-ownership enforcement ────────────
  //
  // The local Zustand cache is tagged with the userId that produced
  // it (`sally.cache.claimedByUserId`). On every auth-state event we
  // compare the incoming userId to the tag:
  //
  //   - signed out             → wipe cache, clear tag.
  //   - no prior tag           → first-claim: tag the cache, normal
  //                              reconcile (cloud<local → push-local
  //                              is safe because no one else owns it
  //                              yet).
  //   - tag matches new user   → same user, normal reconcile.
  //   - tag is OTHER user      → ownership mismatch. The cache belongs
  //                              to USER_A but USER_B just signed in.
  //                              Safety-snapshot → wipe → tag with new
  //                              user → force apply-cloud on hydration
  //                              (never push USER_A's data into
  //                              USER_B's Supabase rows).
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setState((s) => ({ ...s, configured: false, verified: true }));
      return;
    }
    setState((s) => ({ ...s, configured: true }));
    let cancelled = false;

    const handleSession = (userId: string | null, email: string | null) => {
      void email;
      const prevOwner = readCacheOwner();
      let mismatch = false;
      if (userId === null) {
        // Signed out — clear the cache entirely so the next sign-in
        // starts from a clean slate. The pre-sign-out snapshot was
        // taken by the AuthCard sign-out button.
        if (prevOwner !== null) {
          captureSafetyBackup("pre-sign-out", snapshotLocal());
          wipeLocalStoreToEmpty();
          writeCacheOwner(null);
          hydrationRanRef.current = false;
        }
      } else if (prevOwner === null) {
        // First sign-in on this device. Tag the cache with the user
        // so a later account swap can detect it.
        writeCacheOwner(userId);
      } else if (prevOwner !== userId) {
        // Different user just signed in. Foreign cache. Wipe + force
        // apply-cloud on the next hydration.
        console.warn(
          "[cloud-sync] foreign cache detected — wiping local before hydration",
          { prevOwner: prevOwner.slice(0, 8), newUser: userId.slice(0, 8) },
        );
        captureSafetyBackup("pre-account-switch", snapshotLocal());
        wipeLocalStoreToEmpty();
        writeCacheOwner(userId);
        hydrationRanRef.current = false;
        mismatch = true;
        ownershipMismatchRef.current = true;
      }
      setState((s) => ({
        ...s,
        verified: true,
        authenticated: userId !== null,
        cloudUserId: userId,
        ownershipMismatch: mismatch,
        // Force re-hydrate when user changed at all, including
        // sign-out → sign-in cycles.
        hydrated: userId === s.cloudUserId && userId !== null ? s.hydrated : false,
      }));
    };

    (async () => {
      const session = await getCurrentSession();
      if (cancelled) return;
      handleSession(session?.userId ?? null, session?.email ?? null);
    })();
    const unsub = onAuthStateChange((session) => {
      console.info(
        "[cloud-sync] auth state change:",
        session ? `signed in as ${session.userId.slice(0, 8)}` : "signed out",
      );
      handleSession(session?.userId ?? null, session?.email ?? null);
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
      console.info("[cloud-sync] hydration: start");
      setState((s) => ({ ...s, hydrating: true, lastError: null }));
      // 1. Verify schema + RLS.
      const health = await verifyCloudAccess();
      if (cancelled) return;
      console.info("[cloud-sync] verifyCloudAccess →", {
        configured: health.configured,
        authenticated: health.authenticated,
        allOk: health.allOk,
        failing: Object.entries(health.tables)
          .filter(([, v]) => !v.ok)
          .map(([k, v]) => `${k}: ${v.error ?? "?"}`),
      });
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
        console.warn("[cloud-sync] fetchAllEntities failed:", result);
        setState((s) => ({
          ...s,
          hydrating: false,
          lastError: result.detail ?? result.reason,
        }));
        return;
      }
      const cloud = result.data;
      console.info("[cloud-sync] fetchAllEntities ok:", {
        userId: result.userId,
        counts: {
          entries: cloud.entries.length,
          accounts: cloud.accounts.length,
          rules: cloud.rules.length,
          loans: cloud.loans.length,
          incomes: cloud.incomes.length,
        },
      });
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
      // When ownershipMismatch is true we just wiped the local store
      // because the cache belonged to a different user. In that case
      // localR is 0 so the apply-cloud branch fires naturally — but
      // we explicitly skip the push-local branch as belt-and-braces:
      // even if a race re-populated local, we MUST NOT push it into
      // the new user's Supabase rows.
      const skipPush = ownershipMismatchRef.current;
      console.info("[cloud-sync] reconcile:", {
        cloudR,
        localR,
        ownershipMismatch: ownershipMismatchRef.current,
        decision:
          cloudR > localR
            ? "apply-cloud"
            : cloudR < localR && !skipPush
              ? "push-local"
              : "noop",
      });
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
      } else if (cloudR < localR && !skipPush) {
        // Local richer → push local up. Never let an empty cloud
        // overwrite rich local; the inverse is exactly what we ship
        // up here. Suppressed when ownershipMismatch is true so we
        // can never write USER_A's data under USER_B's user_id.
        await pushAllEntities({
          entries: useFinanceStore.getState().entries,
          rules: useFinanceStore.getState().rules,
          accounts: useFinanceStore.getState().accounts,
          loans: useFinanceStore.getState().loans,
          incomes: useFinanceStore.getState().incomes,
        });
      }
      // cloudR === localR: leave both alone.

      ownershipMismatchRef.current = false;
      setState((s) => ({
        ...s,
        hydrating: false,
        hydrated: true,
        ownershipMismatch: false,
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
