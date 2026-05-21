"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { openPendingConfirmation } from "@/lib/pending-confirm-channel";

/**
 * Legacy /confirm/[externalId] deep-link page.
 *
 * After the unified PendingConfirmOverlay shipped, the confirmation
 * UI lives at AppShell level and is opened via a channel rather than
 * a route. This page now exists ONLY to handle the cold-start case
 * where the Service Worker's `openWindow` lands the user on this URL
 * before the SPA has had a chance to subscribe to the channel.
 *
 * Behavior:
 *   1. Fire `openPendingConfirmation(externalId)` so the channel
 *      replays it the moment the AppShell mounts on `/`.
 *   2. router.replace("/") so the user lands on the dashboard with
 *      the overlay floating over it — same UX as a notification tap
 *      when the PWA is already in the foreground.
 *
 * A loader is shown for the few hundred ms it takes the replace to
 * resolve, so the user never sees a flash of empty content.
 */
export function ConfirmPageClient({ externalId }: { externalId: string }) {
  const router = useRouter();

  useEffect(() => {
    if (!externalId) return;
    openPendingConfirmation(externalId);
    router.replace("/");
  }, [externalId, router]);

  return (
    <main className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md">
      <Loader2
        className="h-6 w-6 animate-spin text-muted-foreground"
        strokeWidth={1.6}
      />
    </main>
  );
}
