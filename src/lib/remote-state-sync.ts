"use client";

import { useEffect, useRef } from "react";
import { useFinanceStore } from "@/lib/store";
import { getOrCreateDeviceId } from "@/lib/device-id";

// Bridges the local Zustand store to the server-side state route.
//
// Identity transitions handled on mount:
//
//   1. First-ever load (no previous identity)
//        → apply remote if it exists, otherwise leave local untouched
//
//   2. device:<X>  →  user:<Y>   (FIRST GOOGLE SIGN-IN ON THIS BROWSER)
//        → call /api/auth/claim-device first so the server merges the
//          device blob into the user blob, preserving local data
//        → then GET /api/state and apply the merged result
//
//   3. user:<A>    →  user:<B>   (SWITCHED GOOGLE ACCOUNT)
//        → blank local immediately, then apply user B's remote
//        → if user B has no remote yet, local stays empty
//
//   4. user:<A>    →  device:<X> (SIGNED OUT)
//        → leave local alone (still the right data for this device);
//          server's user blob keeps the cloud copy intact
//
//   5. Same identity as last time
//        → standard last-writer-wins by `updatedAt`

const STATE_VERSION = 1;
const PUSH_DEBOUNCE_MS = 1500;

type ZustandStore = ReturnType<typeof useFinanceStore.getState>;

function scopeHeaders(): Record<string, string> {
  return { "x-sally-device": getOrCreateDeviceId() };
}

type SessionShape = { user?: { id?: string; email?: string } } | null;

async function fetchSession(): Promise<SessionShape> {
  try {
    const res = await fetch("/api/auth/session", { cache: "no-store" });
    return (await res.json()) as SessionShape;
  } catch {
    return null;
  }
}

function identityFor(session: SessionShape): string {
  if (session?.user?.email) return `user:${session.user.email}`;
  return `device:${getOrCreateDeviceId()}`;
}

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

function isLocalEmpty(state: ZustandStore): boolean {
  return (
    state.accounts.length === 0 &&
    state.loans.length === 0 &&
    state.incomes.length === 0 &&
    state.rules.length === 0 &&
    state.entries.length === 0 &&
    state.monthlyBudget === 0
  );
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

  useEffect(() => {
    if (!hydrated || remoteAppliedRef.current) return;
    let cancelled = false;
    (async () => {
      const session = await fetchSession();
      const identity = identityFor(session);
      const previous =
        typeof window !== "undefined"
          ? window.localStorage.getItem("sally.lastIdentity")
          : null;

      const isFirstEver = previous === null;
      const isSameIdentity = previous === identity;
      const isDeviceToUser =
        previous?.startsWith("device:") && identity.startsWith("user:");
      const isUserSwap =
        previous?.startsWith("user:") &&
        identity.startsWith("user:") &&
        previous !== identity;

      // ── Device → User: claim + migrate BEFORE we GET ────────────────
      if (isDeviceToUser) {
        try {
          await fetch("/api/auth/claim-device", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deviceId: getOrCreateDeviceId() }),
          });
        } catch {
          /* claim is best-effort — even if it fails the PUT loop below
           *  will still push the local state up under the user scope. */
        }
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem("sally.lastIdentity", identity);
      }

      // ── Pull remote ─────────────────────────────────────────────────
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
          blob?: {
            version: number;
            updatedAt: number;
            state: unknown;
          } | null;
        };

        const local = useFinanceStore.getState();
        const localEmpty = isLocalEmpty(local);

        // ── Apply / preserve policy ─────────────────────────────────
        if (isUserSwap) {
          // Account swap. The previous local data belongs to a DIFFERENT
          // user — never push it under the new user's scope. Blank and
          // apply whatever the new user has (which may be nothing).
          if (data?.blob) {
            applyRemote(data.blob.state);
          } else {
            applyRemote({});
          }
          return;
        }

        if (isDeviceToUser) {
          // The server-side claim above already merged our device blob
          // into the user blob. The GET we just made will return that
          // merged result. Apply it so local matches the canonical copy.
          if (data?.blob) {
            applyRemote(data.blob.state);
          }
          // If for some reason the GET returned no blob (claim 503'd
          // for example), we deliberately DO NOT blank local — the
          // local data is the user's own data on this device and the
          // PUT loop will save it under the user scope on the next
          // change.
          return;
        }

        if (isFirstEver || isSameIdentity) {
          if (!data?.ok || !data.blob) return;
          const remoteWins =
            localEmpty || data.blob.updatedAt > (local.lastSyncedAt ?? 0);
          if (remoteWins) applyRemote(data.blob.state);
          return;
        }

        // Fallback: any other transition (user → device on sign-out) —
        // leave local alone.
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
  //    DATA SAFETY (Phase 71): never PUT an empty slice once the user
  //    has had real data on this device. An accidental empty PUT
  //    (e.g. a transient store reset, a hydration race) used to wipe
  //    months of real data on the server side. The check:
  //      - if current local is empty AND we ever saw non-empty state
  //        since this listener mounted → suppress the PUT
  //      - this is the conservative direction — we'd rather miss one
  //        legitimate "user deleted everything" write than overwrite
  //        a valid cloud blob with an empty one
  useEffect(() => {
    if (!hydrated) return;
    let sawNonEmptyOnce = false;
    const unsubscribe = useFinanceStore.subscribe((state, prev) => {
      const a = persistedSlice(state);
      const b = persistedSlice(prev);
      if (JSON.stringify(a) === JSON.stringify(b)) return;
      if (!remoteAppliedRef.current) return; // wait for first GET

      const localRichness =
        a.accounts.length +
        a.loans.length +
        a.incomes.length +
        a.rules.length +
        a.entries.length +
        (a.monthlyBudget > 0 ? 1 : 0);
      if (localRichness > 0) sawNonEmptyOnce = true;
      if (localRichness === 0 && sawNonEmptyOnce) {
        console.warn(
          "[remote-state-sync] suppressing empty PUT — prior state had content",
        );
        return;
      }

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
