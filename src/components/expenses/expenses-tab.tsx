"use client";

// Phase 254 — "הוצאות" tab.
//
// Composition of the per-card hierarchy + category breakdown +
// recurring/installments panel. Engine unchanged — only the
// arrangement changes. Sections are collapsible so the user can
// drill from "how much" → "by card" → "by category" → individual
// rows without leaving this surface.

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import { ErrorBoundary } from "@/components/error-boundary";
import { DashboardSection } from "@/components/dashboard/dashboard-section";

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

function Safe({ name, children }: { name: string; children: ReactNode }) {
  return <ErrorBoundary name={name}>{children}</ErrorBoundary>;
}

export function ExpensesTab() {
  return (
    <div className="grid grid-cols-1 gap-5 pb-28 sm:grid-cols-6 sm:gap-5 sm:pb-32">
      {/* Pending tray surfaces only when there are items needing review. */}
      <div className="sm:col-span-6">
        <Safe name="PendingTray">
          <PendingTray />
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
        subtitle="הוצאות קבועות, מנויים, תשלומים פעילים"
        defaultCollapsed={false}
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
    </div>
  );
}
