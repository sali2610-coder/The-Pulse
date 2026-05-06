"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useFinanceStore } from "@/lib/store";
import { getOrCreateDeviceId } from "@/lib/device-id";
import { playSyncChime } from "@/lib/chime";
import { AUTH_ENABLED } from "@/lib/auth-config";
import type { CategoryId } from "@/lib/categories";
import type { Issuer, PaymentMethod } from "@/types/finance";
type FinanceStoreApi = typeof useFinanceStore;

type SyncResponse = {
  ok: boolean;
  configured: boolean;
  transactions: Array<{
    externalId: string;
    amount: number;
    category: string;
    paymentMethod: PaymentMethod;
    installments: number;
    issuer: Issuer;
    cardLast4?: string;
    merchant?: string;
    note?: string;
    occurredAt: string;
    receivedAt: number;
  }>;
  now: number;
};

type FetchOutcome =
  | { kind: "ok"; data: SyncResponse }
  | { kind: "unauthenticated" }
  | { kind: "error"; status: number }
  | { kind: "network" };

const POLL_INTERVAL_MS = 60_000; // background poll every minute when visible

async function fetchSync(since: number): Promise<FetchOutcome> {
  try {
    const url = `/api/transactions/sync?since=${since}`;
    // In multi-user mode the Clerk session cookie carries identity. In legacy
    // single-user mode the server expects an x-sally-device header.
    const headers: Record<string, string> = {};
    if (!AUTH_ENABLED) headers["x-sally-device"] = getOrCreateDeviceId();
    const res = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
      credentials: "same-origin",
    });
    if (res.status === 401) return { kind: "unauthenticated" };
    if (!res.ok) return { kind: "error", status: res.status };
    return { kind: "ok", data: (await res.json()) as SyncResponse };
  } catch {
    return { kind: "network" };
  }
}

/**
 * Pulls server-side queued transactions for this device, applies them through
 * `addExpense({ source: "auto" })` (which de-dups by externalId), and stamps
 * `lastSyncedAt`. Runs on mount, on visibility-change, and on a slow poll.
 *
 * Failures used to swallow silently. Now we surface a one-time toast on the
 * first 401 (session expired) so the user knows to sign in again instead of
 * staring at a static dashboard wondering why nothing shows up.
 */
export function useAutoSync(): void {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const inFlight = useRef(false);
  const warnedAuth = useRef(false);

  useEffect(() => {
    if (!hydrated) return;

    const tick = async () => {
      if (inFlight.current) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      inFlight.current = true;
      try {
        const store: FinanceStoreApi = useFinanceStore;
        const { lastSyncedAt, addExpense, setLastSyncedAt, audioEnabled } =
          store.getState();
        const out = await fetchSync(lastSyncedAt);

        if (out.kind === "unauthenticated") {
          if (!warnedAuth.current) {
            warnedAuth.current = true;
            toast.error("פג הסשן — התחבר שוב כדי לסנכרן");
          }
          return;
        }
        // Reset the auth-warning latch on any non-401 response.
        warnedAuth.current = false;

        if (out.kind !== "ok") return;

        let added = 0;
        for (const tx of out.data.transactions) {
          const result = addExpense({
            amount: tx.amount,
            category: tx.category as CategoryId,
            note: tx.note,
            installments: Math.max(1, tx.installments),
            paymentMethod: tx.paymentMethod,
            source: "auto",
            chargeDate: tx.occurredAt,
            externalId: tx.externalId,
            issuer: tx.issuer,
            cardLast4: tx.cardLast4,
            merchant: tx.merchant,
          });
          if (!result.duplicate) added += 1;
        }
        setLastSyncedAt(out.data.now);
        if (added > 0 && audioEnabled) {
          void playSyncChime();
        }
      } finally {
        inFlight.current = false;
      }
    };

    void tick();

    const onVisibility = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const interval = window.setInterval(tick, POLL_INTERVAL_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [hydrated]);
}

/** Force a one-shot sync, ignoring the visibility gate. Used by the "Sync now" button. */
export async function forceSyncNow(): Promise<{ added: number; ok: boolean }> {
  const store: FinanceStoreApi = useFinanceStore;
  const { lastSyncedAt, addExpense, setLastSyncedAt, audioEnabled } =
    store.getState();
  const out = await fetchSync(lastSyncedAt);
  if (out.kind !== "ok") return { added: 0, ok: false };
  let added = 0;
  for (const tx of out.data.transactions) {
    const result = addExpense({
      amount: tx.amount,
      category: tx.category as CategoryId,
      note: tx.note,
      installments: Math.max(1, tx.installments),
      paymentMethod: tx.paymentMethod,
      source: "auto",
      chargeDate: tx.occurredAt,
      externalId: tx.externalId,
      issuer: tx.issuer,
      cardLast4: tx.cardLast4,
      merchant: tx.merchant,
    });
    if (!result.duplicate) added += 1;
  }
  setLastSyncedAt(out.data.now);
  if (added > 0 && audioEnabled) void playSyncChime();
  return { added, ok: true };
}
