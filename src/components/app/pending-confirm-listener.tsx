"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Listens for `sally:pending-confirm` messages posted by the Service
 * Worker when the user taps a categorize push. iOS Safari PWA can drop
 * `WindowClient.navigate()` silently in standalone mode, so we route
 * via the Next router instead of relying on the SW's navigate call.
 */
export function PendingConfirmListener() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    function onMessage(event: MessageEvent) {
      const data = event.data as
        | { type?: string; path?: string; externalId?: string }
        | null;
      if (!data || data.type !== "sally:pending-confirm") return;
      const target = data.path || (data.externalId
        ? `/confirm/${encodeURIComponent(data.externalId)}`
        : null);
      if (!target) return;
      console.info("[PendingConfirmListener] navigating →", target);
      router.push(target);
    }

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, [router]);

  return null;
}
