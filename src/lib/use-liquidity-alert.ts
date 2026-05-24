"use client";

// Phase 212 — fires a single proactive push per day when the
// liquidity engine flags a projected dip into the red.
//
// Triggered from the dashboard mount path. The server route
// dedupes per scope per day separately, so even if multiple
// devices fire, only one push lands. Local dedup avoids hitting
// the server at all when we know we've already sent today.

import { useEffect, useRef } from "react";

import { getOrCreateDeviceId } from "@/lib/device-id";

const LAST_SENT_KEY = "sally.liquidity-alert.last-day";

function todayKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function useLiquidityAlert(args: {
  willCrossZero: boolean;
  daysUntilDip: number;
  lowestBalance: number;
  lowestAtISO?: string | null;
}): void {
  const sentRef = useRef(false);
  const willCrossZero = args.willCrossZero;
  const daysUntilDip = args.daysUntilDip;
  const lowestBalance = args.lowestBalance;
  const lowestAtISO = args.lowestAtISO ?? null;

  useEffect(() => {
    if (!willCrossZero) return;
    if (sentRef.current) return;
    if (typeof window === "undefined") return;

    let cancelled = false;
    const today = todayKey();
    try {
      const last = window.localStorage.getItem(LAST_SENT_KEY);
      if (last === today) {
        sentRef.current = true;
        return;
      }
    } catch {
      /* ignore */
    }

    // Fire once. Cap the request with a 5s abort so a stuck network
    // can't strand the mount cycle.
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 5000);
    sentRef.current = true;
    (async () => {
      try {
        await fetch("/api/push/liquidity-alert", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-sally-device": getOrCreateDeviceId(),
          },
          credentials: "same-origin",
          signal: ctrl.signal,
          body: JSON.stringify({
            daysUntilDip,
            lowestAt: lowestAtISO ?? undefined,
            lowestBalance,
          }),
        });
        if (cancelled) return;
        try {
          window.localStorage.setItem(LAST_SENT_KEY, today);
        } catch {
          /* ignore */
        }
      } catch {
        /* ignore — sentRef stays true; retry tomorrow naturally */
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      ctrl.abort();
    };
  }, [willCrossZero, daysUntilDip, lowestBalance, lowestAtISO]);
}

export function _resetLiquidityAlertForTests(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LAST_SENT_KEY);
  } catch {
    /* ignore */
  }
}
