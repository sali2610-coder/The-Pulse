"use client";

import { useEffect } from "react";

// Service Worker registration.
//
// Earlier deploys ran with this component unregistering every prior SW
// on mount to debug a Safari shell-cache crash (Phase 35). That fix
// turned into the root cause of "push notifications never appear on
// iPhone" — the SW was being torn down every time the PWA mounted, so
// pushManager.getSubscription() always returned null and the push
// pipeline had nothing to deliver to.
//
// The original Safari crash was actually resolved by a separate change
// (lazy-loading dashboard cards). We can register the SW again. This
// time the SW (public/sw.js) does NOT intercept fetches — it only
// handles `push` and `notificationclick` events — so it cannot
// resurrect the original shell-cache bug.

const SW_PATH = "/sw.js";

export function RegisterSW() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Avoid double-registration: getRegistration() returns the existing
    // one if present, register() is a no-op for the same URL+scope.
    let cancelled = false;
    (async () => {
      try {
        const existing = await navigator.serviceWorker.getRegistration();
        if (cancelled) return;
        if (
          existing &&
          existing.active &&
          existing.active.scriptURL.endsWith(SW_PATH)
        ) {
          // Push for an update so a new SW_VERSION rolls forward.
          existing.update().catch(() => undefined);
          return;
        }
        await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
      } catch (err) {
        console.error("[RegisterSW] failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
