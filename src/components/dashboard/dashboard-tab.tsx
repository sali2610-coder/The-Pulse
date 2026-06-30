"use client";

// Phase 433 · AURORA v1 — Production Home tab.
//
// Wraps the shared AuroraAppShell with the Supabase auth gate and
// snapshot provider. DashboardSkeleton stays during hydration.

import { ErrorBoundary } from "@/components/error-boundary";
import { SnapshotProvider } from "@/lib/snapshot-context";
import { useCloudSyncState } from "@/lib/supabase/cloud-sync-context";
import { useFinanceStore } from "@/lib/store";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { AuroraAppShell } from "@/components/aurora/aurora-app-shell";

export function DashboardTab() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const cloudSync = useCloudSyncState();

  const showCurtain = Boolean(
    cloudSync?.configured &&
      (!cloudSync.verified ||
        (cloudSync.authenticated && !cloudSync.hydrated)),
  );

  if (showCurtain) {
    return <DashboardSkeleton />;
  }
  void hydrated;

  return (
    <SnapshotProvider>
      <ErrorBoundary name="AuroraShell">
        <AuroraAppShell />
      </ErrorBoundary>
    </SnapshotProvider>
  );
}
