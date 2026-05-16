"use client";

import { useEffect } from "react";

// Service Worker registration.
//
// Gated on:
//   1. Production build (no SW during dev — would break HMR).
//   2. Window has SW support.
//   3. URL does NOT carry `?nosw=1` — escape hatch for QA when a previous
//      SW is suspected to be intercepting navigation incorrectly.
//
// If the URL carries `?nosw=1` or `?reset=1`, we ALSO actively
// `unregister()` any prior registrations so the user can recover from
// being stuck behind a stale Service Worker.

export function RegisterSW() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const search = new URLSearchParams(window.location.search);
    const optOut = search.has("nosw") || search.has("reset");

    if (optOut) {
      // Tear down any prior SW so subsequent navigations hit the network
      // fresh. Also drop the cache storage shell so old chunks aren't
      // served from disk.
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
      return;
    }

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => {
        console.warn("[sw] registration failed", err);
      });
  }, []);

  return null;
}
