"use client";

// Phase 254 — "עתידי" tab.
// Phase 272 — duplicated hero ("איפה אהיה בתאריך") removed.
//
// That hero is the Home tab's primary identity. Repeating it here
// blurred the screen's purpose. Future tab now leads straight into
// forward-looking surfaces — monthly folders, liquidity curve,
// upcoming obligations, cash-flow buckets, forecast timeline, anchor
// trajectory. Each tab owns one mental model:
//   Home    → immediate financial pulse
//   Expenses→ where money goes
//   Future  → timeline + cashflow projections   ← we're here
//   Insights→ behavioral understanding
//   Settings→ control / configuration
//
// Composition only — engines unchanged.

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import { ErrorBoundary } from "@/components/error-boundary";
import { ObligationsAndWeek } from "@/components/future/obligations-and-week";

const lazy = (
  loader: () => Promise<{ default: React.ComponentType<Record<string, unknown>> }>,
) => dynamic(loader, { ssr: false });

const MonthlyCashflowCard = lazy(() =>
  import("@/components/dashboard/monthly-cashflow-card").then((m) => ({
    default:
      m.MonthlyCashflowCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
// Phase 313 — LiquidityCurveCard + AnchorTrajectoryCard consolidated
// into the new CashflowForecast35 container. Both component files
// stay on disk for other surfaces.
const CashflowForecast35 = lazy(() =>
  import("@/components/future/cashflow-forecast-35").then((m) => ({
    default:
      m.CashflowForecast35 as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
// Phase 287 — CashflowBucketsCard + UpcomingOutflowsCard now live
// behind the ObligationsAndWeek lens selector below.
const ForecastTimelineCard = lazy(() =>
  import("@/components/dashboard/forecast-timeline-card").then((m) => ({
    default:
      m.ForecastTimelineCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

function Safe({ name, children }: { name: string; children: ReactNode }) {
  return <ErrorBoundary name={name}>{children}</ErrorBoundary>;
}

export function FutureTab() {
  return (
    <div className="grid grid-cols-1 gap-4 pb-28 sm:grid-cols-6 sm:gap-4 sm:pb-32">
      {/* Phase 268 — month-first cashflow folders. Replaces the
         merged "bucket source" list with one folder per month. */}
      <div className="sm:col-span-6">
        <Safe name="MonthlyCashflowCard">
          <MonthlyCashflowCard />
        </Safe>
      </div>
      {/* Phase 313 — single unified 35-day forecast container.
         Replaces LiquidityCurveCard + AnchorTrajectoryCard. */}
      <div className="sm:col-span-6">
        <Safe name="CashflowForecast35">
          <CashflowForecast35 />
        </Safe>
      </div>
      {/* Phase 287 — "התחייבויות לפי מקור" + "השבוע הבא" merged into
         one button-driven container. Default closed; user picks the
         lens. Only one open at a time. */}
      <div className="sm:col-span-6">
        <Safe name="ObligationsAndWeek">
          <ObligationsAndWeek />
        </Safe>
      </div>
      <div className="sm:col-span-6">
        <Safe name="ForecastTimelineCard">
          <ForecastTimelineCard />
        </Safe>
      </div>
    </div>
  );
}
