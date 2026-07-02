"use client";

// Phase 429 — Quiet Concierge Home tab.
//
// The previous widget grid (Phase 225 → Phase 417) has been gutted.
// Every former Home component (PulseBar, TimelineSync, StatsCards,
// CfoSummary card chrome, DailyAllowance card, HousingCard,
// LoanSummaryCard, MonthlyObligationsHeader, RecurringCalendarCard,
// CashflowBuckets, ObligationsTimelineCard, AccountBridgeCard,
// CopilotCard, SmartInsightsCard, FloatingCTA on Home, danger-breath
// ambient glow, ...) was removed from the Home route. Those files
// stay on disk for other surfaces that import them; only this tab's
// composition changes.
//
// The Home tab is now ONE continuous Charcoal canvas hosting the
// HomeContent compound from src/components/home/sections.tsx —
// HeroSection, ChangeAndNextSection, PendingAndActionsSection,
// ObligationsSection, IncomeSection, ConciergeNoteSection,
// UpcomingSection, RecentActivitySection. No floating CTA. No cards.

import { ErrorBoundary } from "@/components/error-boundary";
import { SnapshotProvider } from "@/lib/snapshot-context";
import { useCloudSyncState } from "@/lib/supabase/cloud-sync-context";
import { useFinanceStore } from "@/lib/store";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { HomeShell, HomeStateRoot } from "@/components/home/primitives";
import { HomeContent } from "@/components/home/sections";

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
  // The HomeShell is rendered even pre-hydration so the visual frame
  // never flashes; HomeContent renders skeleton/empty states internally.
  void hydrated;

  return (
    <SnapshotProvider>
      <ErrorBoundary name="HomeShell">
        <HomeShell>
          <HomeStateRoot>
            <HomeContent />
          </HomeStateRoot>
        </HomeShell>
      </ErrorBoundary>
    </SnapshotProvider>
  );
}
