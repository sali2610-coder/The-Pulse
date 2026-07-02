"use client";

// Home v2 · Dashboard tab (Portfolio Pro).
//
// Auth-gated production Home. Renders the Portfolio Pro variant so
// the deployed branch shows the approved visual language to real
// users. UI-only surface — every number is composed by useHomeData
// via existing engine helpers. Zero engine change.

import { ErrorBoundary } from "@/components/error-boundary";
import { SnapshotProvider } from "@/lib/snapshot-context";
import { useCloudSyncState } from "@/lib/supabase/cloud-sync-context";
import { useFinanceStore } from "@/lib/store";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { useHomeData } from "@/components/home/use-home-data";
import { VariantPortfolioPro } from "@/components/home/variants/variant-portfolio-pro";

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
      <ErrorBoundary name="PortfolioProHome">
        <ProHomeMount />
      </ErrorBoundary>
    </SnapshotProvider>
  );
}

function ProHomeMount() {
  const data = useHomeData();
  return <VariantPortfolioPro data={data} />;
}
