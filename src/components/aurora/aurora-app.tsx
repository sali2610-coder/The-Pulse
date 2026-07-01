"use client";

// Phase 448 · AURORA app root — replaces the legacy 5-tab AppShell
// for authenticated users. UI composition fix only; no engine, no
// business logic touched.
//
// QA-001 root cause: legacy AppShellContent kept mounting its own
// header + TabsList wrapper around DashboardTab. DashboardTab was
// already re-plumbed to render the full-screen AuroraAppShell (its
// own TopBar + BottomNav). Two shells stacked → visible legacy
// skeleton behind Aurora on production.
//
// Fix: root renders <AuroraApp /> which mounts AuroraAppShell alone
// as the visual surface, while re-wiring every essential service the
// legacy AppShellContent used to install:
//   • CloudSyncProvider
//   • useAutoBackup
//   • useStoreMutationBridge
//   • installGlobalErrorHandlers on mount
//   • installWebVitals on mount
//   • flushBudgetSettings pending-push retry
//   • AutoSync worker
//   • PendingConfirmListener + PendingConfirmOverlay
//   • Dev-only SeedPanel

import { useEffect } from "react";

import { AuroraAppShell } from "@/components/aurora/aurora-app-shell";
import { PendingConfirmListener } from "@/components/app/pending-confirm-listener";
import { PendingConfirmOverlay } from "@/components/confirmation/pending-confirm-overlay";
import { SeedPanel } from "@/components/dev/seed-panel";
import { AutoSync } from "@/components/sync/auto-sync";
import { ErrorBoundary, PageFallback } from "@/components/error-boundary";
import { useAutoBackup } from "@/lib/auto-backup";
import { flushBudgetSettings } from "@/lib/budget-settings-flush";
import { installGlobalErrorHandlers } from "@/lib/error-log";
import { useStoreMutationBridge } from "@/lib/store-mutation-bridge";
import { useFinanceStore } from "@/lib/store";
import { CloudSyncProvider } from "@/lib/supabase/cloud-sync-context";
import { installWebVitals } from "@/lib/web-vitals";

const isDev = process.env.NODE_ENV !== "production";

export function AuroraApp() {
  return (
    <ErrorBoundary name="AuroraApp" fallback={<PageFallback />}>
      <CloudSyncProvider>
        <AuroraAppServices />
        <AuroraAppShell />
        <AutoSync />
        <PendingConfirmListener />
        <PendingConfirmOverlay />
        {isDev ? <SeedPanel /> : null}
      </CloudSyncProvider>
    </ErrorBoundary>
  );
}

function AuroraAppServices() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  useAutoBackup();
  useStoreMutationBridge();

  useEffect(() => installGlobalErrorHandlers(), []);
  useEffect(() => installWebVitals(), []);

  // Phase 288 — pending-push retry: if a prior session wrote budget
  // or text-scale changes locally but the cloud upsert never landed,
  // re-flush on mount so the user's choice catches up.
  useEffect(() => {
    if (!hydrated) return;
    const st = useFinanceStore.getState();
    const budgetPending =
      st.budgetSettingsUpdatedAt > (st.budgetSettingsCloudAt ?? 0);
    const textScalePending =
      st.textScaleUpdatedAt > (st.textScaleCloudAt ?? 0);
    if (budgetPending || textScalePending) {
      void flushBudgetSettings();
    }
  }, [hydrated]);

  return null;
}
