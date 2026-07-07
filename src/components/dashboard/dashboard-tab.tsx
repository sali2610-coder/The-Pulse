"use client";

// Phase 225 — consumer-first dashboard refactor.
//
// Replaces the analyst-style 80+ card bento with a calm hero stack
// + grouped collapsed sections. Reuses every existing calculation
// (forecast, liquidity, risk-warnings, cash-flow buckets …); only
// the visual hierarchy + density changes.
//
// First-paint reveals three hero cards and six collapsed section
// headers. Each header shows a single colored summary chip so the
// user reads the bottom-line of every section without expanding.

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";

import { useFinanceStore } from "@/lib/store";
import { ErrorBoundary } from "@/components/error-boundary";
// FloatingCTA replaced by PrimaryActionDock — component file preserved on disk.
import { ExpenseDialog } from "@/components/expense-form/expense-dialog";
import { WithdrawalDialog } from "@/components/expense-form/withdrawal-dialog";
import { SnapshotProvider } from "@/lib/snapshot-context";
import { useCloudSyncState } from "@/lib/supabase/cloud-sync-context";
// Phase — DashboardSection accordion retired for the 3 Home sections
// below (Obligations / Income / Watch). They now render behind a
// static <SectionHeader> so the user sees everything without a click.
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
// computeSummaries import dropped alongside DashboardSection above.

import { useAttentionCount } from "@/components/dashboard/attention-center";
import { openAttentionCenter } from "@/lib/use-attention-center";
import { motion as fmMotion } from "framer-motion";
import { Bell as BellIcon, ArrowLeft as ArrowLeftIcon } from "lucide-react";
import { tap as hapticTap } from "@/lib/haptics";
import { TapDiscoveryToast } from "@/components/dashboard/tap-discovery-toast";
import { PortfolioHeroCard } from "@/components/home/portfolio-hero-card";
import { PrimaryActionDock } from "@/components/home/primary-action-dock";
import { IncomeActualSheet } from "@/components/income/income-actual-sheet";
import { navigateToTab } from "@/lib/tab-nav";
import { SubPager } from "@/components/app/sub-pager";

const lazy = (
  loader: () => Promise<{
    default: React.ComponentType<Record<string, unknown>>;
  }>,
) => dynamic(loader, { ssr: false });

// ── Always-on critical surfaces ────────────────────────────────────
const WelcomeSetupCard = lazy(() =>
  import("@/components/dashboard/welcome-setup-card").then((m) => ({
    default:
      m.WelcomeSetupCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
// Phase — StaleAnchorsBanner removed from Home mount; component
// file preserved on disk for any future caller.
const PendingTray = lazy(() =>
  import("@/components/dashboard/pending-tray").then((m) => ({
    default:
      m.PendingTray as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

// Phase 285 — future-cashflow lazy components removed from Home.
// They still ship via the "עתידי" tab.

// Phase 286 — credit-cards lazies removed from Home.
// Phase 303 — CategorySpendCard lazy decl dropped too; the
// "ניתוחים וסטטיסטיקות" section no longer mounts the per-category
// breakdown ("לאן הולך הכסף") because the Expenses tab is now its
// single home.

// ── Obligations section ───────────────────────────────────────────
// Phase — expanded experience unified into a single premium
// ObligationsDashboard. Legacy cards (MonthlyObligationsHeader,
// LoanSummaryCard, HousingCard, RecurringCalendarCard) preserved on
// disk for any surface that still imports them; Home no longer mounts
// them. All values still flow through buildObligationsOverview.
const ObligationsDashboard = lazy(() =>
  import("@/components/obligations/obligations-dashboard").then((m) => ({
    default:
      m.ObligationsDashboard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
// Phase 297 — ObligationsTimelineCard lazy decl removed from Home.
// Component file remains on disk for any future surface that wants it.

// ── Income section ────────────────────────────────────────────────
// Phase — expanded experience unified into a single premium
// IncomeLauncher: hero ring + next-income secondary + expandable
// per-income edit list. Legacy cards (IncomeBreakdownCard,
// IncomeForecastCard) preserved on disk for surfaces that still
// import them; Home no longer mounts them.
const IncomeLauncher = lazy(() =>
  import("@/components/income/income-launcher").then((m) => ({
    default:
      m.IncomeLauncher as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

// ── Analytics section ─────────────────────────────────────────────
// Phase 303 — CategoryDonut + HeatmapMini lazy decls dropped here.
// Both visuals duplicated the Expenses-tab CategorySpendCard / the
// dedicated analytics screens.
// Phase 311 — analytics-section lazy decls removed entirely.
// CategoryParetoCard, CategoryPaceCard, SpendSplitCard, NetWorthCard,
// NetWorthTrendCard, RunwayCard, FixedCostRatioCard, AvgTicketCard,
// WeekendSpendCard component files stay on disk so other tabs can
// import them.

// ── Watch / subscriptions / anomalies section ────────────────────
// Phase — expanded experience unified into a single premium
// WatchLauncher: severity hero + 3 metric chips + expandable list
// of every attention item. Legacy cards (SubscriptionReviewCard,
// SubscriptionRadarCard, AnomalyBanner, AnomaliesCard, SmartInsights-
// Card) preserved on disk for other surfaces; Home no longer mounts
// them.
const WatchLauncher = lazy(() =>
  import("@/components/watch/watch-launcher").then((m) => ({
    default:
      m.WatchLauncher as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
// Phase 330 — "הצעות חכמות" removed from Home. Duplicate of Insights
// tab content; component file stays on disk for other surfaces.

// Phase 295 — "פירוט מתקדם" overflow section retired. The six lazy
// declarations it hosted (PulseBar, SmartSummaryCard,
// SpentThisMonthCard, AccountBridgeCard, ExpectedBalanceCard,
// DailyInsightsCard) are removed from Home; the components remain on
// disk so other surfaces that import them keep working.
// Phase — TodayPulseCard removed from Home mount; component
// file preserved on disk for any future caller.
const RecentActivity = lazy(() =>
  import("@/components/dashboard/recent-activity").then((m) => ({
    default:
      m.RecentActivity as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const CopilotCard = lazy(() =>
  import("@/components/dashboard/copilot-card").then((m) => ({
    default:
      m.CopilotCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
function Safe({ name, children }: { name: string; children: ReactNode }) {
  return <ErrorBoundary name={name}>{children}</ErrorBoundary>;
}

const HOME_STATIONS = [
  { id: "portfolio", label: "פורטפוליו" },
  { id: "overview", label: "סקירה" },
  { id: "activity", label: "פעילות" },
  { id: "health", label: "בריאות" },
] as const;

export function DashboardTab() {
  const [open, setOpen] = useState(false);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [incomeSheetOpen, setIncomeSheetOpen] = useState(false);
  const [station, setStation] = useState(0);
  const cloudSync = useCloudSyncState();

  const showCurtain = Boolean(
    cloudSync?.configured &&
      (!cloudSync.verified ||
        (cloudSync.authenticated && !cloudSync.hydrated)),
  );

  if (showCurtain) {
    return <DashboardSkeleton />;
  }

  return (
    <SnapshotProvider>
      <TapDiscoveryToast />
      <div className="home-sub-shell pb-28">
        <SubPager
          stations={HOME_STATIONS as unknown as { id: string; label: string }[]}
          activeIndex={station}
          onIndexChange={setStation}
        >
          {/* ── Station 1 · Portfolio ───────────────────────────── */}
          <section className="home-station" aria-labelledby="hs-portfolio">
            <h2 id="hs-portfolio" className="sr-only">
              פורטפוליו
            </h2>
            <Safe name="PortfolioHeroCard">
              <PortfolioHeroCard />
            </Safe>
            <div className="empty:hidden">
              <Safe name="WelcomeSetupCard">
                <WelcomeSetupCard />
              </Safe>
            </div>
          </section>

          {/* ── Station 2 · Financial Overview ─────────────────── */}
          <section className="home-station" aria-labelledby="hs-overview">
            <h2 id="hs-overview" className="sr-only">
              סקירה פיננסית
            </h2>
            <Safe name="ObligationsDashboard">
              <ObligationsDashboard />
            </Safe>
            <Safe name="IncomeLauncher">
              <IncomeLauncher />
            </Safe>
          </section>

          {/* ── Station 3 · Monthly Activity ───────────────────── */}
          <section className="home-station" aria-labelledby="hs-activity">
            <h2 id="hs-activity" className="sr-only">
              פעילות החודש
            </h2>
            <div className="empty:hidden">
              <Safe name="CopilotCard">
                <CopilotCard />
              </Safe>
            </div>
            <div className="empty:hidden">
              <Safe name="RecentActivity">
                <RecentActivity />
              </Safe>
            </div>
          </section>

          {/* ── Station 4 · Health Center ──────────────────────── */}
          <section className="home-station" aria-labelledby="hs-health">
            <h2 id="hs-health" className="sr-only">
              מרכז בריאות
            </h2>
            <div className="empty:hidden">
              <Safe name="PendingTray">
                <PendingTray />
              </Safe>
            </div>
            <div className="empty:hidden">
              <Safe name="AttentionBanner">
                <AttentionBanner />
              </Safe>
            </div>
            <Safe name="WatchLauncher">
              <WatchLauncher />
            </Safe>
          </section>
        </SubPager>

        <PrimaryActionDock
          onExpense={() => setOpen(true)}
          onIncome={() => setIncomeSheetOpen(true)}
          onTransfer={() => setWithdrawalOpen(true)}
          onCredit={() => navigateToTab("analytics")}
          onLoan={() => navigateToTab("setup", "loans-mini-app")}
        />

        <ExpenseDialog open={open} onOpenChange={setOpen} />
        <WithdrawalDialog
          open={withdrawalOpen}
          onOpenChange={setWithdrawalOpen}
        />
        <IncomeActualSheet
          open={incomeSheetOpen}
          onOpenChange={setIncomeSheetOpen}
        />
      </div>
    </SnapshotProvider>
  );
}

function AttentionBanner() {
  const count = useAttentionCount();
  if (count === 0) return null;
  return (
    <fmMotion.button
      type="button"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      onClick={() => {
        hapticTap();
        openAttentionCenter();
      }}
      aria-label={`פתח את מרכז תשומת הלב · ${count} פריטים`}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#FBBF24]/30 bg-[#FBBF24]/8 p-3 text-start transition-colors hover:border-[#FBBF24]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FBBF24]/60"
      style={{
        boxShadow:
          "0 16px 40px -22px rgba(251, 191, 36, 0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#FBBF24]/15 text-[#FBBF24]">
          <BellIcon className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="text-[12px] uppercase tracking-[0.22em] text-[#FBBF24]">
            מרכז תשומת הלב
          </span>
          <span className="text-section text-foreground">
            {count} פריטים דורשים בדיקה
          </span>
        </div>
      </div>
      <ArrowLeftIcon className="size-4 shrink-0 text-[#FBBF24]" aria-hidden />
    </fmMotion.button>
  );
}

// Phase — static section header. Replaces the DashboardSection
// accordion for the three Home sections that now render open by
// default (Obligations / Income / Watch). No collapse, no arrow,
// no container box — just a title + subtitle sitting on top of a
// premium hairline divider so the grid flows uninterrupted.
function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <header
      className="sally-section-header sm:col-span-6"
      dir="rtl"
      aria-label={title}
    >
      <div className="sally-section-header-text">
        <span className="sally-section-header-title">{title}</span>
        <span className="sally-section-header-sub">{subtitle}</span>
      </div>
      <span aria-hidden className="sally-section-header-divider" />
    </header>
  );
}
