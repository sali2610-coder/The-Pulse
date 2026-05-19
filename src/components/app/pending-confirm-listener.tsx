"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { getOrCreateDeviceId } from "@/lib/device-id";

/**
 * Routes the user to /confirm/<externalId> after a notification tap.
 *
 * Three signals are honored, in order of speed:
 *
 *   1. ServiceWorker postMessage — fires the moment notificationclick
 *      runs IF the PWA was already open and reachable from
 *      clients.matchAll. Most responsive when it works.
 *
 *   2. Server-side click beacon — the SW also POSTs the externalId to
 *      `/api/push/click`. On mount and on every visibilitychange this
 *      listener GETs the same endpoint (which atomically consumes the
 *      marker). Covers the iOS standalone PWA case where postMessage
 *      and openWindow both silently fail.
 *
 *   3. Visibility change — every time the PWA returns to foreground
 *      (e.g. user taps the notification banner), re-check the beacon.
 *
 * Only one of the three needs to fire for the navigation to happen;
 * a guard flag prevents double-routing for the same externalId.
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
      const target =
        path ?? `/confirm/${encodeURIComponent(externalId)}`;
      console.info("[PendingConfirmListener] → ", target);
      router.push(target);
    }

    async function pollBeacon() {
      try {
        const res = await fetch("/api/push/click", {
          method: "GET",
          headers: { "x-sally-device": getOrCreateDeviceId() },
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as {
          click?: { externalId?: string; ts?: number } | null;
        } | null;
        const click = data?.click;
        if (!click?.externalId) return;
        // Ignore stale beacons (>5 min) — server already TTLs to 300s
        // but a clock skew + caching could leak older data.
        if (click.ts && Date.now() - click.ts > 5 * 60 * 1000) return;
        navigateOnce(click.externalId);
      } catch {
        /* offline — beacon will retry on next visibility change */
      }
    }

    // 1. SW postMessage path
    function onMessage(event: MessageEvent) {
      const data = event.data as
        | {
            type?: string;
            path?: string;
            externalId?: string;
          }
        | null;
      if (!data || data.type !== "sally:pending-confirm") return;
      if (!data.externalId) return;
      navigateOnce(data.externalId, data.path);
    }

    // 2. Beacon on mount.
    void pollBeacon();

    // 3. Beacon on visibility resume.
    function onVisible() {
      if (document.visibilityState === "visible") void pollBeacon();
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onMessage);
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", onMessage);
      }
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
