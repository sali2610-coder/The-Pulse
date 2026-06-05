"use client";

// Phase 254 — "הוצאות" tab.
// Phase 270 — default-collapsed recurring section + anomaly-gated
// summary chip.
// Phase 365 — CFO forecast container removed from the top. That
// story now belongs entirely to the זמן tab (TimeScreen). Expenses
// opens straight on "where is the money going?" — categories +
// cards + recurring. A single quiet header line points to זמן for
// users who want the forecast.

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import { ErrorBoundary } from "@/components/error-boundary";
import { DashboardSection } from "@/components/dashboard/dashboard-section";
import { navigateToTab } from "@/lib/tab-nav";
import { tap as hapticTap } from "@/lib/haptics";
import { ChevronLeft, Sparkles } from "lucide-react";
import { ExpensesCommitmentsCockpit } from "@/components/expenses/expenses-commitments-cockpit";

const lazy = (
  loader: () => Promise<{ default: React.ComponentType<Record<string, unknown>> }>,
) => dynamic(loader, { ssr: false });

const CardsHierarchyCard = lazy(() =>
  import("@/components/dashboard/cards-hierarchy-card").then((m) => ({
    default:
      m.CardsHierarchyCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const CategorySpendCard = lazy(() =>
  import("@/components/dashboard/category-spend-card").then((m) => ({
    default:
      m.CategorySpendCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const PendingTray = lazy(() =>
  import("@/components/dashboard/pending-tray").then((m) => ({
    default:
      m.PendingTray as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
// Phase 365 — CfoSummary + HealthScoreCard slots removed from the
// Expenses tab to stop duplicating the זמן story.
// Phase 366 — LiquidityTimelineCard slot removed for the same
// reason. The Time tab is the canonical liquidity surface.
// Phase 304 — interactive analytics widgets.
const CategoryDonut = lazy(() =>
  import("@/components/dashboard/category-donut").then((m) => ({
    default:
      m.CategoryDonut as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const HeatmapMini = lazy(() =>
  import("@/components/dashboard/heatmap-mini").then((m) => ({
    default:
      m.HeatmapMini as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

function Safe({ name, children }: { name: string; children: ReactNode }) {
  return <ErrorBoundary name={name}>{children}</ErrorBoundary>;
}

export function ExpensesTab() {
  return (
    <div className="grid grid-cols-1 gap-4 pb-28 sm:grid-cols-6 sm:gap-4 sm:pb-32">
      {/* Pending tray surfaces only when there are items needing review.
          Phase 276 — `empty:hidden` collapses the wrapper when the
          lazy child renders null so the grid stays tight. */}
      <div className="sm:col-span-6 empty:hidden">
        <Safe name="PendingTray">
          <PendingTray />
        </Safe>
      </div>

      {/* Phase 376 — Commitments Cockpit V2. ADDITION-only summary
         layer at the top. Inline-expand-only — never a modal, never
         a drawer, never navigation. Existing cards below stay
         exactly as they were. */}
      <div className="sm:col-span-6 empty:hidden">
        <Safe name="ExpensesCommitmentsCockpit">
          <ExpensesCommitmentsCockpit />
        </Safe>
      </div>

      {/* Phase 365 — quiet header. Forecast lives in the זמן tab; a
         single tap takes the user there without crowding this view
         with a duplicate summary. */}
      <div className="sm:col-span-6">
        <ForecastHeader />
      </div>

      {/* Categories lead — "where is my money going?" answered first. */}
      <div className="sm:col-span-6">
        <Safe name="CategorySpendCard">
          <CategorySpendCard />
        </Safe>
      </div>

      {/* Cards breakdown follows — same question, card-aware lens. */}
      <div className="sm:col-span-6">
        <Safe name="CardsHierarchyCard">
          <CardsHierarchyCard />
        </Safe>
      </div>

      {/* Phase 383 — "חיובים שיורדים אוטומטית" moved to the
         Insights tab (inside the "חיובים קבועים והלוואות" folder).
         Expenses = money. Insights = analysis. */}

      {/* Phase 275 — liquidity timeline kept here but folded behind
         a quiet accordion. Useful but visually heavy when always
         expanded. */}
      {/* Phase 304 — interactive analytics. Donut for category
         drilldown, heatmap for day-level exploration. Both are
         clickable: tap a slice / day to see the full breakdown. */}
      <DashboardSection
        storageKey="expenses.analytics"
        title="ניתוחים גרפיים"
        subtitle="פילוח קטגוריות + חום ימי החודש — אינטראקטיביים"
        defaultCollapsed
      >
        <div className="sm:col-span-6">
          <Safe name="CategoryDonut">
            <CategoryDonut />
          </Safe>
        </div>
        <div className="sm:col-span-6">
          <Safe name="HeatmapMini">
            <HeatmapMini />
          </Safe>
        </div>
      </DashboardSection>

      {/* Phase 366 — "ציר נזילות 35 ימים" folder removed from
         Expenses. Liquidity forecast is the זמן tab's job; keeping
         a second timeline here was visual load without new
         information. The LiquidityTimelineCard component still
         exists on disk for other consumers; only the UI slot is
         dropped from this tab. */}
    </div>
  );
}

function ForecastHeader() {
  return (
    <button
      type="button"
      onClick={() => {
        hapticTap();
        navigateToTab("history");
      }}
      className="flex w-full items-center justify-between gap-2 rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3 text-right transition-colors hover:border-white/16"
      dir="rtl"
      aria-label="פתח את זמן — תחזית מלאה"
    >
      <ChevronLeft className="size-4 text-muted-foreground" aria-hidden />
      <span className="flex flex-1 items-center gap-2 text-right">
        <Sparkles className="size-3.5 text-gold/80" aria-hidden />
        <span className="text-[12.5px] text-foreground/80">
          תחזית סוף החודש חיה בלשונית{" "}
          <span className="font-semibold text-foreground">זמן</span>
        </span>
      </span>
    </button>
  );
}

