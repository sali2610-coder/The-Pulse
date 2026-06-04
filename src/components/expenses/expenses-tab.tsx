"use client";

// Phase 373 — Expenses tab radically simplified.
//
// One question, one answer: "לאן הולך לי הכסף החודש?"
//
// The radial ObligationsCockpit IS the answer. Everything else
// (categories / cards / recurring / installments / donut / heatmap)
// lives behind ONE quiet "פירוט מלא" drawer at the bottom so users
// who want the deep dive get it, while users who just want the
// answer see only the cockpit.
//
// Same philosophy as the Time screen: visual intelligence over
// information density. Engine + helpers unchanged.

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import { ErrorBoundary } from "@/components/error-boundary";
import { ObligationsCockpit } from "@/components/expenses/obligations-cockpit";
import { ExpenseDetailDrawer } from "@/components/expenses/expense-detail-drawer";
import { FinancialDebugPanel } from "@/components/dev/financial-debug-panel";

const lazy = (
  loader: () => Promise<{ default: React.ComponentType<Record<string, unknown>> }>,
) => dynamic(loader, { ssr: false });

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
    <div className="flex flex-col gap-6 pb-28 sm:pb-32">
      {/* Pending tray surfaces only when there are items needing
         review. Auto-collapses when empty via the lazy child. */}
      <div className="empty:hidden">
        <Safe name="PendingTray">
          <PendingTray />
        </Safe>
      </div>

      {/* THE answer. Radial control center — see Phase 372. */}
      <Safe name="ObligationsCockpit">
        <ObligationsCockpit />
      </Safe>

      {/* One quiet drawer holds every supporting card. */}
      <Safe name="ExpenseDetailDrawer">
        <ExpenseDetailDrawer />
      </Safe>

      {/* Dev-only Financial Debug Panel — Phase 371. */}
      {process.env.NODE_ENV !== "production" ? (
        <Safe name="FinancialDebugPanel">
          <FinancialDebugPanel />
        </Safe>
      ) : null}
    </div>
  );
}
