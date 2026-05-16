"use client";

import { useEffect } from "react";

// Service Worker registration is FULLY DISABLED.
//
// Production was experiencing Safari "This page couldn't load" failures
// that survived `?reset=1` runs, suggesting either WebKit + SW
// incompatibility on the user's macOS build or a stale SW that no
// `?reset=1` query could reach. To rule SW out completely, this
// component now ONLY unregisters every prior registration and never
// registers a new one.
//
// Re-enable later by restoring the `navigator.serviceWorker.register`
// branch — but only after confirming the SW isn't the failure cause.

export function RegisterSW() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => undefined);
    if ("caches" in window) {
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .catch(() => undefined);
    }
  }, []);

  return null;
}
