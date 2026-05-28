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
import { captureEvent } from "@/lib/analytics";
import {
  deleteAccount,
  deleteEntry,
  deleteIncome,
  deleteLoan,
  deleteRule,
  fetchAllEntities,
  fetchUserSettings,
  pushAllEntities,
  upsertAccount,
  upsertEntry,
  upsertIncome,
  upsertLoan,
  upsertRule,
  upsertUserSettings,
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
  /** Tracks navigator.onLine. False suppresses cloud writes (the
   *  failed-write queue stores them for retry on reconnect). */
  online: boolean;
  /** Counter incremented on every online/visible event. The hydration
   *  effect depends on this so a reconnect or foreground-after-
   *  background re-pulls fresh cloud state — proxy for cross-device
   *  convergence without a realtime channel. */
  reconnectTick: number;
  /** Count of writes currently held in the retry queue (visible in
   *  CloudSyncCard so the user sees pending uploads). */
  pendingRetries: number;
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
  online: true,
  reconnectTick: 0,
  pendingRetries: 0,
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

// ── Failed-write retry queue ─────────────────────────────────────────
// Holds writes that failed mid-flight (offline, transient 5xx, RLS
// glitch). Drained when:
//   - the next debounced subscribe flush fires
//   - an online event fires
//   - hydration completes
// Bounded at 200 to avoid unbounded growth. Newest-first dropoff so a
// long offline session never throws away the LATEST write.

type RetryKind = "entry" | "account" | "rule" | "loan" | "income" | "settings";
type RetryOp = "upsert" | "delete";
type RetryItem =
  | { kind: "entry"; op: "upsert"; payload: import("@/types/finance").ExpenseEntry }
  | { kind: "entry"; op: "delete"; id: string }
  | { kind: "account"; op: "upsert"; payload: import("@/types/finance").Account }
  | { kind: "account"; op: "delete"; id: string }
  | { kind: "rule"; op: "upsert"; payload: import("@/types/finance").RecurringRule }
  | { kind: "rule"; op: "delete"; id: string }
  | { kind: "loan"; op: "upsert"; payload: import("@/types/finance").Loan }
  | { kind: "loan"; op: "delete"; id: string }
  | { kind: "income"; op: "upsert"; payload: import("@/types/finance").Income }
  | { kind: "income"; op: "delete"; id: string }
  | {
      kind: "settings";
      op: "upsert";
      monthlyBudget: number;
      budgetMode?: "manual" | "auto";
      budgetSafetyBuffer?: number;
    };

const RETRY_MAX = 200;
const retryQueue: RetryItem[] = [];

function enqueueRetry(item: RetryItem): void {
  retryQueue.push(item);
  if (retryQueue.length > RETRY_MAX) {
    retryQueue.splice(0, retryQueue.length - RETRY_MAX);
  }
}

void ({} as RetryKind);
void ({} as RetryOp);

export function useCloudSync(): CloudSyncState {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const [state, setState] = useState<CloudSyncState>(INITIAL);
  const hydrationRanRef = useRef(false);
  // Mirror of state.ownershipMismatch so the hydration effect can read
  // the latest value without taking a dependency on it — keeping it in
  // the dep array would re-fire the effect on every reconcile.
  const ownershipMismatchRef = useRef(false);
  // Holds the latest retry-queue drain fn so the reconnect-tick effect
  // can flush queued failures without forcing the write-loop effect to
  // re-mount. See the write-loop effect for the Bug 1 rationale.
  const drainRetryRef = useRef<(() => Promise<void>) | null>(null);

  // ── Online + visibility listeners ─────────────────────────────────
  // Bumps `reconnectTick` on transition events so the hydration
  // effect's dep array picks up the change and re-pulls. Acts as the
  // proxy for cross-device convergence: foreground/online → re-pull.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const setOnline = (online: boolean) => {
      setState((s) => ({
        ...s,
        online,
        // Reset hydration flag so the next online tick re-pulls.
        ...(online
          ? { reconnectTick: s.reconnectTick + 1 }
          : {}),
      }));
      if (online) hydrationRanRef.current = false;
    };
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setState((s) => ({ ...s, reconnectTick: s.reconnectTick + 1 }));
        hydrationRanRef.current = false;
      }
    };
    // Seed initial value.
    setState((s) => ({ ...s, online: navigator.onLine }));
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

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
      try {
        captureEvent(session ? "auth_signed_in" : "auth_signed_out");
      } catch {
        /* analytics never blocks auth flow */
      }
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

      // 2b. Pull user-level settings (currently just monthlyBudget).
      //    Settings are reconciled separately because they aren't part
      //    of the entity richness math. Rule:
      //      - cloud > 0, local 0   → apply cloud
      //      - cloud > 0, local > 0 → cloud wins (last-writer wins
      //        and cloud was the last accepted value)
      //      - cloud 0, local > 0   → push local up
      //      - cloud 0, local 0     → noop
      //    Push-local is suppressed when ownershipMismatch is true
      //    (foreign cache shouldn't write into the new user's row).
      try {
        const settingsRes = await fetchUserSettings();
        if (!cancelled && settingsRes.ok) {
          const cloudBudget = settingsRes.monthlyBudget;
          const localState = useFinanceStore.getState();
          const localBudget = localState.monthlyBudget;
          const api = useFinanceStore.setState as (
            partial: Partial<ReturnType<typeof useFinanceStore.getState>>,
          ) => void;

          // Phase 245 + 263 — reconciliation rules:
          //   1. cloud value undefined → no opinion. Never push DEFAULT
          //      local back up — that's the reinstall bug that
          //      silently clobbered a previously-saved "auto" with
          //      the fresh-install "manual" default.
          //   2. Local is "opinionated" only when
          //      budgetSettingsUpdatedAt > 0. Default state never
          //      writes to cloud.
          //   3. localRecent (≤ 5 min since the user touched the
          //      toggle) gates "local wins" over a stale explicit
          //      cloud value — covers "set auto + close app fast".
          const LOCAL_RECENT_MS = 5 * 60 * 1000;
          const cloudHasMode = settingsRes.budgetMode !== undefined;
          const cloudHasBuffer =
            typeof settingsRes.budgetSafetyBuffer === "number";
          const localOpinionated =
            localState.budgetSettingsUpdatedAt > 0;
          const localRecent =
            localOpinionated &&
            Date.now() - localState.budgetSettingsUpdatedAt <
              LOCAL_RECENT_MS;

          if (cloudBudget > 0) {
            if (cloudBudget !== localBudget && !localRecent) {
              api({ monthlyBudget: cloudBudget });
            } else if (localRecent && localBudget !== cloudBudget) {
              // Local wins — push our value up.
              await upsertUserSettings({
                monthlyBudget: localBudget,
                budgetMode: localState.budgetMode,
                budgetSafetyBuffer: localState.budgetSafetyBuffer,
              });
            }
          } else if (
            localBudget > 0 &&
            localOpinionated &&
            !ownershipMismatchRef.current
          ) {
            await upsertUserSettings({
              monthlyBudget: localBudget,
              budgetMode: localState.budgetMode,
              budgetSafetyBuffer: localState.budgetSafetyBuffer,
            });
          }

          if (
            cloudHasMode &&
            settingsRes.budgetMode !== localState.budgetMode
          ) {
            if (localRecent && !ownershipMismatchRef.current) {
              // Local wins — push our mode up instead of accepting
              // the stale cloud value.
              await upsertUserSettings({
                monthlyBudget: useFinanceStore.getState().monthlyBudget,
                budgetMode: localState.budgetMode,
                budgetSafetyBuffer: localState.budgetSafetyBuffer,
              });
            } else {
              // Cloud is authority. Apply over local. Also bump the
              // local timestamp so a follow-up reconcile doesn't
              // treat the just-applied value as "opinionated by the
              // user" — leaves cloud as the source of truth.
              api({
                budgetMode: settingsRes.budgetMode,
                budgetSettingsUpdatedAt:
                  localState.budgetSettingsUpdatedAt || Date.now(),
              });
            }
          } else if (
            !cloudHasMode &&
            localOpinionated &&
            !ownershipMismatchRef.current
          ) {
            // Cloud has no opinion AND local was explicitly set by
            // the user → push local up so future hydrations see it.
            // NEVER push when local is still the default — that's the
            // reinstall bug.
            await upsertUserSettings({
              monthlyBudget: useFinanceStore.getState().monthlyBudget,
              budgetMode: localState.budgetMode,
              budgetSafetyBuffer: localState.budgetSafetyBuffer,
            });
          }
          if (
            cloudHasBuffer &&
            settingsRes.budgetSafetyBuffer !== localState.budgetSafetyBuffer
          ) {
            if (localRecent && !ownershipMismatchRef.current) {
              await upsertUserSettings({
                monthlyBudget: useFinanceStore.getState().monthlyBudget,
                budgetMode: localState.budgetMode,
                budgetSafetyBuffer: localState.budgetSafetyBuffer,
              });
            } else {
              api({ budgetSafetyBuffer: settingsRes.budgetSafetyBuffer });
            }
          }
        }
      } catch (err) {
        console.warn("[cloud-sync] fetchUserSettings failed:", err);
      }

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
  }, [hydrated, state.configured, state.authenticated, state.reconnectTick]);

  // ── Write loop: push store mutations up ────────────────────────────
  // Subscribes once after hydration. Fires on every store change
  // with a 1.5s debounce. Only pushes ENTITIES that actually changed
  // (shallow id-keyed diff).
  //
  // CRITICAL: `state.reconnectTick` is NOT in deps. Putting it there
  // tears down the subscription + cancels any pending debounce timer
  // on every visibility/online tick — a save followed by a tab
  // refocus inside the 1.5s window silently dropped the write
  // (Bug 1, May 2026). The retry-drain that used to live here moved
  // to its own effect below so reconnect ticks still flush queued
  // failures but do NOT interrupt in-flight debounced writes.
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
      monthlyBudget: useFinanceStore.getState().monthlyBudget,
      budgetMode: useFinanceStore.getState().budgetMode,
      budgetSafetyBuffer: useFinanceStore.getState().budgetSafetyBuffer,
    };

    // Apply a single cloud write. On failure (offline, RLS glitch,
    // network), enqueue for retry. Status return type lets us avoid
    // throwing from the helper functions.
    const tryWrite = async (
      op: () => Promise<{ ok: true } | { ok: false; reason: string; detail?: string }>,
      retryItem: RetryItem,
    ): Promise<boolean> => {
      try {
        const r = await op();
        if (!r.ok) {
          enqueueRetry(retryItem);
          setState((cur) => ({
            ...cur,
            lastError: r.detail ?? r.reason,
            pendingRetries: retryQueue.length,
          }));
          return false;
        }
        return true;
      } catch (err) {
        enqueueRetry(retryItem);
        setState((cur) => ({
          ...cur,
          lastError: err instanceof Error ? err.message : "sync_failed",
          pendingRetries: retryQueue.length,
        }));
        return false;
      }
    };

    // Drain the retry queue. Stops on first failure so a still-down
    // backend doesn't burn the whole queue on the same error. Updates
    // pendingRetries count after the pass.
    const drainRetryQueue = async () => {
      if (retryQueue.length === 0) return;
      while (retryQueue.length > 0) {
        const item = retryQueue[0];
        let ok = false;
        if (item.kind === "entry") {
          ok =
            item.op === "upsert"
              ? (await upsertEntry(item.payload)).ok
              : (await deleteEntry(item.id)).ok;
        } else if (item.kind === "account") {
          ok =
            item.op === "upsert"
              ? (await upsertAccount(item.payload)).ok
              : (await deleteAccount(item.id)).ok;
        } else if (item.kind === "rule") {
          ok =
            item.op === "upsert"
              ? (await upsertRule(item.payload)).ok
              : (await deleteRule(item.id)).ok;
        } else if (item.kind === "loan") {
          ok =
            item.op === "upsert"
              ? (await upsertLoan(item.payload)).ok
              : (await deleteLoan(item.id)).ok;
        } else if (item.kind === "income") {
          ok =
            item.op === "upsert"
              ? (await upsertIncome(item.payload)).ok
              : (await deleteIncome(item.id)).ok;
        } else if (item.kind === "settings") {
          ok = (await upsertUserSettings({
            monthlyBudget: item.monthlyBudget,
            budgetMode: item.budgetMode,
            budgetSafetyBuffer: item.budgetSafetyBuffer,
          })).ok;
        }
        if (!ok) break;
        retryQueue.shift();
      }
      setState((cur) => ({ ...cur, pendingRetries: retryQueue.length }));
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
          monthlyBudget: s.monthlyBudget,
          budgetMode: s.budgetMode,
          budgetSafetyBuffer: s.budgetSafetyBuffer,
        };

        // Drain anything that previously failed BEFORE pushing the new
        // diff — preserves causal order so an edit doesn't overwrite a
        // queued delete.
        await drainRetryQueue();

        // Compute added/updated rows by reference-inequality on each
        // entity. New ids OR updated row identities trigger an upsert.
        const upsertChangedSafe = async <
          T extends { id: string },
          K extends RetryItem["kind"],
        >(
          prev: T[],
          curr: T[],
          fn: (item: T) => Promise<{ ok: true } | { ok: false; reason: string; detail?: string }>,
          kind: K,
        ) => {
          const prevById = new Map(prev.map((p) => [p.id, p] as const));
          for (const item of curr) {
            const old = prevById.get(item.id);
            if (old !== item) {
              await tryWrite(
                () => fn(item),
                { kind, op: "upsert", payload: item } as unknown as RetryItem,
              );
            }
          }
        };
        const deleteRemovedSafe = async <
          T extends { id: string },
          K extends RetryItem["kind"],
        >(
          prev: T[],
          curr: T[],
          fn: (id: string) => Promise<{ ok: true } | { ok: false; reason: string; detail?: string }>,
          kind: K,
        ) => {
          const currIds = new Set(curr.map((c) => c.id));
          for (const old of prev) {
            if (!currIds.has(old.id)) {
              await tryWrite(
                () => fn(old.id),
                { kind, op: "delete", id: old.id } as RetryItem,
              );
            }
          }
        };

        // Order: deletes first (free up unique constraints), then
        // upserts. Within each pass, accounts before entries because
        // entries can reference an account_id.
        await deleteRemovedSafe(lastSnap.accounts, next.accounts, deleteAccount, "account");
        await deleteRemovedSafe(lastSnap.rules, next.rules, deleteRule, "rule");
        await deleteRemovedSafe(lastSnap.loans, next.loans, deleteLoan, "loan");
        await deleteRemovedSafe(lastSnap.incomes, next.incomes, deleteIncome, "income");
        await deleteRemovedSafe(lastSnap.entries, next.entries, deleteEntry, "entry");

        await upsertChangedSafe(lastSnap.accounts, next.accounts, upsertAccount, "account");
        await upsertChangedSafe(lastSnap.rules, next.rules, upsertRule, "rule");
        await upsertChangedSafe(lastSnap.loans, next.loans, upsertLoan, "loan");
        await upsertChangedSafe(lastSnap.incomes, next.incomes, upsertIncome, "income");
        await upsertChangedSafe(lastSnap.entries, next.entries, upsertEntry, "entry");

        if (
          next.monthlyBudget !== lastSnap.monthlyBudget ||
          next.budgetMode !== lastSnap.budgetMode ||
          next.budgetSafetyBuffer !== lastSnap.budgetSafetyBuffer
        ) {
          await tryWrite(
            () =>
              upsertUserSettings({
                monthlyBudget: next.monthlyBudget,
                budgetMode: next.budgetMode,
                budgetSafetyBuffer: next.budgetSafetyBuffer,
              }),
            {
              kind: "settings",
              op: "upsert",
              monthlyBudget: next.monthlyBudget,
              budgetMode: next.budgetMode,
              budgetSafetyBuffer: next.budgetSafetyBuffer,
            },
          );
        }
        lastSnap = next;
        setState((cur) => ({
          ...cur,
          lastSyncAt: Date.now(),
          pendingRetries: retryQueue.length,
        }));
      }, 1500);
    });

    // Stash the drain fn on the ref so the reconnect-tick effect can
    // call it without owning the closure or re-mounting this effect.
    drainRetryRef.current = drainRetryQueue;

    // Initial drain when the write loop comes online.
    void drainRetryQueue();

    return () => {
      unsub();
      drainRetryRef.current = null;
      // Force-flush any in-flight debounce on teardown (sign-out etc.)
      // so a pending write isn't dropped silently.
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [state.hydrated, state.authenticated]);

  // Drain the retry queue on every reconnect / foreground tick. Kept
  // separate from the write loop so reconnect events never cancel an
  // in-flight debounced write (Bug 1, May 2026).
  useEffect(() => {
    if (!state.hydrated || !state.authenticated) return;
    const fn = drainRetryRef.current;
    if (fn) void fn();
  }, [state.hydrated, state.authenticated, state.reconnectTick]);

  return state;
}
