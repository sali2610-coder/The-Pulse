"use client";

// Phase 254 — "הוצאות" tab.
// Phase 270 — default-collapsed recurring section + anomaly-gated
// summary chip. The recurring obligations live in many other views
// (categories, card breakdown, future cashflow, settings). Showing
// the panel expanded by default was duplication and noise. Now the
// header is a quiet one-liner unless an insight needs attention.

import dynamic from "next/dynamic";
import { useMemo, type ReactNode } from "react";

import { ErrorBoundary } from "@/components/error-boundary";
import { DashboardSection } from "@/components/dashboard/dashboard-section";
import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { buildRecurringSectionSummary } from "@/lib/recurring-section-summary";

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
const RecurringRulesPanel = lazy(() =>
  import("@/components/recurring/recurring-rules-panel").then((m) => ({
    default:
      m.RecurringRulesPanel as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const ActiveInstallmentsCard = lazy(() =>
  import("@/components/dashboard/active-installments-card").then((m) => ({
    default:
      m.ActiveInstallmentsCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const PendingTray = lazy(() =>
  import("@/components/dashboard/pending-tray").then((m) => ({
    default:
      m.PendingTray as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
// Phase 275 — financial-control-center cards relocated from the
// Home advanced section. CfoSummary is the "Delta Plus" premium
// opening analysis. HealthScoreCard sits next to it. Liquidity
// timeline lives behind a default-collapsed accordion so the page
// stays scannable but the data is still reachable.
const CfoSummary = lazy(() =>
  import("@/components/dashboard/cfo-summary").then((m) => ({
    default:
      m.CfoSummary as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const HealthScoreCard = lazy(() =>
  import("@/components/dashboard/health-score-card").then((m) => ({
    default:
      m.HealthScoreCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const LiquidityTimelineCard = lazy(() =>
  import("@/components/dashboard/liquidity-timeline-card").then((m) => ({
    default:
      m.LiquidityTimelineCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

function Safe({ name, children }: { name: string; children: ReactNode }) {
  return <ErrorBoundary name={name}>{children}</ErrorBoundary>;
}

export function ExpensesTab() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);

  const summary = useMemo(() => {
    if (!hydrated) return null;
    return buildRecurringSectionSummary({
      entries,
      rules,
      statuses,
      monthKey: currentMonthKey(),
    });
  }, [hydrated, entries, rules, statuses]);

  const recurringSubtitle = summary
    ? summary.insights.total > 0
      ? `${summary.insights.total} ${
          summary.insights.total === 1 ? "תובנה" : "תובנות"
        } לבדיקה`
      : `${summary.sourceCount} מקורות • ${ILS.format(
          Math.round(summary.monthlyTotal),
        )} לחודש`
    : "הוצאות קבועות, מנויים, תשלומים פעילים";

  const recurringSummaryChip = summary
    ? summary.insights.total > 0
      ? {
          value: `${summary.insights.total} לבדיקה`,
          tone: "warn" as const,
        }
      : {
          value: `${ILS.format(Math.round(summary.monthlyTotal))}/חודש`,
          tone: "info" as const,
        }
    : undefined;

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

      {/* Phase 275 — premium opening analysis. CFO forecast + health
         score sit at the very top so the user lands on real numbers,
         not yet another list. */}
      <div className="sm:col-span-6">
        <Safe name="CfoSummary">
          <CfoSummary />
        </Safe>
      </div>
      <div className="sm:col-span-6">
        <Safe name="HealthScoreCard">
          <HealthScoreCard />
        </Safe>
      </div>

      <div className="sm:col-span-6">
        <Safe name="CardsHierarchyCard">
          <CardsHierarchyCard />
        </Safe>
      </div>

      <div className="sm:col-span-6">
        <Safe name="CategorySpendCard">
          <CategorySpendCard />
        </Safe>
      </div>

      <DashboardSection
        storageKey="expenses.recurring"
        title="חיובים שיורדים אוטומטית כל חודש"
        subtitle={recurringSubtitle}
        summary={recurringSummaryChip}
        defaultCollapsed={true}
      >
        <div className="sm:col-span-6">
          <Safe name="RecurringRulesPanel">
            <RecurringRulesPanel />
          </Safe>
        </div>
        <div className="sm:col-span-6">
          <Safe name="ActiveInstallmentsCard">
            <ActiveInstallmentsCard />
          </Safe>
        </div>
      </DashboardSection>

      {/* Phase 275 — liquidity timeline kept here but folded behind
         a quiet accordion. Useful but visually heavy when always
         expanded. */}
      <DashboardSection
        storageKey="expenses.liquidity-timeline"
        title="ציר נזילות 35 ימים"
        subtitle="תזרים יומי מצטבר עם הכנסות וחיובים"
        defaultCollapsed
      >
        <div className="sm:col-span-6">
          <Safe name="LiquidityTimelineCard">
            <LiquidityTimelineCard />
          </Safe>
        </div>
      </DashboardSection>
    </div>
  );
}
