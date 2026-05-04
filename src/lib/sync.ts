"use client";

import { useEffect, useRef } from "react";
import { useFinanceStore } from "@/lib/store";
import { getOrCreateDeviceId } from "@/lib/device-id";
import { playSyncChime } from "@/lib/chime";
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

const POLL_INTERVAL_MS = 60_000; // background poll every minute when visible

async function fetchSync(deviceId: string, since: number): Promise<SyncResponse | null> {
  try {
    const url = `/api/transactions/sync?since=${since}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "x-sally-device": deviceId },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as SyncResponse;
  } catch {
    return null;
  }
}

/**
 * Pulls server-side queued transactions for this device, applies them through
 * `addExpense({ source: "auto" })` (which de-dups by externalId), and stamps
 * `lastSyncedAt`. Runs on mount, on visibility-change, and on a slow poll.
 */
export function useAutoSync(): void {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!hydrated) return;

    const tick = async () => {
      if (inFlight.current) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      inFlight.current = true;
      try {
        // Read the current values directly from the store at fire time so we
        // don't need ref-mirroring (which lints flag as ref-during-render).
        const store: FinanceStoreApi = useFinanceStore;
        const { lastSyncedAt, addExpense, setLastSyncedAt, audioEnabled } =
          store.getState();
        const deviceId = getOrCreateDeviceId();
        const res = await fetchSync(deviceId, lastSyncedAt);
        if (!res || !res.ok) return;
        let added = 0;
        for (const tx of res.transactions) {
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
        setLastSyncedAt(res.now);
        if (added > 0 && audioEnabled) {
          // Best-effort, non-blocking — autoplay rules may still gate it.
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
