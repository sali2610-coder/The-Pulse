"use client";

import { useEffect, useRef } from "react";
import { useFinanceStore } from "@/lib/store";
import { getOrCreateDeviceId } from "@/lib/device-id";
import { AUTH_ENABLED } from "@/lib/auth-config";

// Bridges the local Zustand store to the server-side state route.
//
// Flow:
//   1. On mount (once hydration completes): GET /api/state and merge the
//      blob into the store if it's newer than what we have locally.
//   2. Subscribe to store changes; debounce them; PUT /api/state with the
//      whole snapshot. Last-writer-wins by `updatedAt`.
//
// Why a single blob and not per-table writes:
//   - Zero new schemas. The store already has all the migration logic.
//   - One PUT per change → one KV write → cheap and predictable.
//   - Cross-device sync works the moment the route is wired.
//
// Limits:
//   - Two simultaneous tabs can race. We resolve by comparing the server's
//     `updatedAt` on the GET response, but if both tabs are actively
//     writing the last writer wins. This is acceptable for a personal
//     finance app — concurrent editing is rare.

const STATE_VERSION = 1;
const PUSH_DEBOUNCE_MS = 1500;

type ZustandStore = ReturnType<typeof useFinanceStore.getState>;

function scopeHeaders(): Record<string, string> {
  // Always send the device id. The server's resolveRequestScope picks the
  // strongest signal available (NextAuth session → device-claim → bare
  // device id), so the header is harmless when a session exists and load-
  // bearing when it doesn't.
  void AUTH_ENABLED;
  return { "x-sally-device": getOrCreateDeviceId() };
}

/** Returns the current identity string: the signed-in user's email when a
 *  NextAuth session is active, otherwise "device:<deviceId>". Used to
 *  detect cross-account swaps on the same browser. */
async function currentIdentity(): Promise<string> {
  try {
    const res = await fetch("/api/auth/session", { cache: "no-store" });
    const json = (await res.json()) as { user?: { email?: string } } | null;
    if (json?.user?.email) return `user:${json.user.email}`;
  } catch {
    /* fall through to device identity */
  }
  return `device:${getOrCreateDeviceId()}`;
}

/** Extract the persisted slice of the store. Mirrors the Zustand
 *  `partialize` shape — derived flags like `hasHydrated` stay local. */
function persistedSlice(state: ZustandStore) {
  return {
    entries: state.entries,
    rules: state.rules,
    statuses: state.statuses,
    monthlyBudget: state.monthlyBudget,
    lastSyncedAt: state.lastSyncedAt,
    accounts: state.accounts,
    loans: state.loans,
    incomes: state.incomes,
    audioEnabled: state.audioEnabled,
  };
}

/** Apply a remote blob to the local store, only for the fields the bridge
 *  manages. Other fields keep their current values. */
function applyRemote(state: unknown) {
  if (!state || typeof state !== "object") return;
  const r = state as Partial<ReturnType<typeof persistedSlice>>;
  const api = useFinanceStore.setState as (
    partial: Partial<ZustandStore>,
  ) => void;
  api({
    entries: r.entries ?? [],
    rules: r.rules ?? [],
    statuses: r.statuses ?? [],
    monthlyBudget:
      typeof r.monthlyBudget === "number" ? r.monthlyBudget : 0,
    lastSyncedAt:
      typeof r.lastSyncedAt === "number" ? r.lastSyncedAt : 0,
    accounts: r.accounts ?? [],
    loans: r.loans ?? [],
    incomes: r.incomes ?? [],
    audioEnabled:
      typeof r.audioEnabled === "boolean" ? r.audioEnabled : true,
  });
}

/**
 * Mount once at the root of the app. Hydrates from the server then pushes
 * subsequent store changes back. Failures are silent — the local Zustand
 * persist middleware keeps the app fully functional offline.
 */
export function useRemoteStateSync(): void {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const remoteAppliedRef = useRef(false);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Pull on first hydration. Detect identity change — if the signed-in
  //    user (or device id) differs from the last identity that wrote to
  //    this browser, FORCE-REPLACE the local store from the remote blob.
  //    Without this guard, a second user signing in on the same browser
  //    would inherit the previous user's cached Zustand state when their
  //    remote blob is older than the previous user's lastSyncedAt.
  useEffect(() => {
    if (!hydrated || remoteAppliedRef.current) return;
    let cancelled = false;
    (async () => {
      const identity = await currentIdentity();
      const previous =
        typeof window !== "undefined"
          ? window.localStorage.getItem("sally.lastIdentity")
          : null;
      const identityChanged = previous !== null && previous !== identity;
      if (typeof window !== "undefined" && identity) {
        window.localStorage.setItem("sally.lastIdentity", identity);
      }

      try {
        const res = await fetch("/api/state", {
          method: "GET",
          headers: scopeHeaders(),
          credentials: "same-origin",
          cache: "no-store",
        });
        if (cancelled || !res.ok) return;
        const data = (await res.json()) as {
          ok?: boolean;
          configured?: boolean;
          blob?: { version: number; updatedAt: number; state: unknown } | null;
        };

        // Identity changed and remote is empty → blank local so we don't
        // leak the previous user's data into this session.
        if (identityChanged && !data?.blob) {
          applyRemote({});
          return;
        }
        if (!data?.ok || !data.blob) return;

        const local = useFinanceStore.getState();
        const localEmpty =
          local.accounts.length === 0 &&
          local.loans.length === 0 &&
          local.incomes.length === 0 &&
          local.rules.length === 0 &&
          local.entries.length === 0 &&
          local.monthlyBudget === 0;
        const remoteWins =
          identityChanged ||
          localEmpty ||
          data.blob.updatedAt > (local.lastSyncedAt ?? 0);
        if (remoteWins) {
          applyRemote(data.blob.state);
        }
      } catch {
        /* offline — local store keeps app usable */
      } finally {
        if (!cancelled) remoteAppliedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  // 2. Push on changes, debounced.
  useEffect(() => {
    if (!hydrated) return;
    const unsubscribe = useFinanceStore.subscribe((state, prev) => {
      // Only react to changes in the persisted slice.
      const a = persistedSlice(state);
      const b = persistedSlice(prev);
      if (JSON.stringify(a) === JSON.stringify(b)) return;
      if (!remoteAppliedRef.current) return; // wait for first GET
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = setTimeout(() => {
        void fetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...scopeHeaders() },
          credentials: "same-origin",
          body: JSON.stringify({ version: STATE_VERSION, state: a }),
        }).catch(() => undefined);
      }, PUSH_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    };
  }, [hydrated]);
}
