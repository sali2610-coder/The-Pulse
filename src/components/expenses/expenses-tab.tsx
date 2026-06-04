"use client";

// Phase 374 — Expenses tab clean summary.
//
// Reverts the Phase 373 detail drawer (it brought back clutter).
// The Expenses tab now answers ONE question and only one question:
//
//   "לאן הולך הכסף החודש?"
//
// PendingTray surfaces only when there are items needing review.
// ObligationsCockpit (radial control center, Phase 372) IS the
// answer. Nothing else lives on this surface. Deeper detail lives
// on its own dedicated screens accessed from elsewhere in the app.
//
// Engine + helpers unchanged.

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import { ErrorBoundary } from "@/components/error-boundary";
import { ObligationsCockpit } from "@/components/expenses/obligations-cockpit";
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
      <div className="empty:hidden">
        <Safe name="PendingTray">
          <PendingTray />
        </Safe>
      </div>

      <Safe name="ObligationsCockpit">
        <ObligationsCockpit />
      </Safe>

      {process.env.NODE_ENV !== "production" ? (
        <Safe name="FinancialDebugPanel">
          <FinancialDebugPanel />
        </Safe>
      ) : null}
    </div>
  );
}
