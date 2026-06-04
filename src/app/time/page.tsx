// Phase 358 — standalone /time route.
//
// Mounts TimeScreen on its own URL so push notifications + Home
// Screen shortcuts can deep-link straight into the flagship surface
// without the user landing on Home first.

import { TimeScreenPage } from "@/components/time/time-screen-page";

export const dynamic = "force-dynamic";

export default function TimeRoute() {
  return <TimeScreenPage />;
}
