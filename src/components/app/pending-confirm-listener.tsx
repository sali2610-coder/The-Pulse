"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { getOrCreateDeviceId } from "@/lib/device-id";

/**
 * Routes the user to /confirm/<externalId> after a notification tap.
 *
 * iOS Safari PWA scenarios that this has to cover:
 *
 *   1. PWA is in background. Tap notification.
 *      - iOS foregrounds the existing PWA window.
 *      - visibilitychange fires.
 *      - SW notificationclick runs concurrently; its POST to
 *        /api/push/click may complete BEFORE OR AFTER our first
 *        beacon read on visibility resume — so we have to retry.
 *
 *   2. PWA is closed. Tap notification.
 *      - SW.openWindow may or may not honor the deep URL on iOS
 *        standalone — Apple ships this inconsistently.
 *      - When the PWA mounts, the URL is often just `/`. The mount
 *        beacon poll then catches the marker and router.push'es.
 *
 *   3. PWA is foreground already. Tap notification (rare).
 *      - SW.postMessage delivers immediately.
 *
 * Strategy: combine three signals AND retry the beacon a few times
 * after every visibility resume.
 */
export function PendingConfirmListener() {
  const router = useRouter();
  const lastHandledRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function navigateOnce(externalId: string, path?: string) {
      if (!externalId) return;
      if (lastHandledRef.current === externalId) return;
      lastHandledRef.current = externalId;
      const target = path ?? `/confirm/${encodeURIComponent(externalId)}`;
      console.info("[PendingConfirmListener] →", target);
      router.push(target);
    }

    let stopRetries = false;
    async function pollBeacon(): Promise<boolean> {
      try {
        const res = await fetch("/api/push/click", {
          method: "GET",
          headers: { "x-sally-device": getOrCreateDeviceId() },
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) return false;
        const data = (await res.json().catch(() => null)) as {
          click?: { externalId?: string; ts?: number } | null;
        } | null;
        const click = data?.click;
        if (!click?.externalId) return false;
        if (click.ts && Date.now() - click.ts > 5 * 60 * 1000) return false;
        navigateOnce(click.externalId);
        return true;
      } catch {
        return false;
      }
    }

    /** Retry sequence — handles the SW-writes-after-PWA-foregrounds
     *  race. Each successful poll consumes the marker server-side so
     *  later retries naturally short-circuit. */
    async function pollWithRetries() {
      stopRetries = false;
      const delays = [0, 400, 900, 1800, 3000];
      for (const ms of delays) {
        if (stopRetries) return;
        if (ms > 0) await new Promise((r) => setTimeout(r, ms));
        if (stopRetries) return;
        const hit = await pollBeacon();
        if (hit) {
          stopRetries = true;
          return;
        }
      }
    }

    function onMessage(event: MessageEvent) {
      const data = event.data as
        | { type?: string; path?: string; externalId?: string }
        | null;
      if (!data || data.type !== "sally:pending-confirm") return;
      if (!data.externalId) return;
      navigateOnce(data.externalId, data.path);
    }

    function onVisible() {
      if (document.visibilityState !== "visible") return;
      void pollWithRetries();
    }

    function onFocus() {
      void pollWithRetries();
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onMessage);
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);

    // First poll on mount — covers the "PWA cold-started by the
    // notification tap" case where there's no visibility/focus event.
    void pollWithRetries();

    return () => {
      stopRetries = true;
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", onMessage);
      }
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [router]);

  return null;
}
