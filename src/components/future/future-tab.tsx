"use client";

// Phase 254 — "עתידי" tab.
// Phase 272 — duplicated hero ("איפה אהיה בתאריך") removed.
// Phase 358 — tab promoted to flagship "זמן" experience. TimeScreen
// owns the hero; the legacy 35-day forecast + monthly folder cluster
// lives below it as supporting detail (still accessible, no longer
// the headline).
//
// Each tab owns one mental model:
//   Home    → immediate financial pulse
//   Expenses→ where money goes
//   זמן     → financial time machine                 ← flagship
//   Insights→ behavioral understanding
//   Settings→ control / configuration
//
// Composition only — engines unchanged.

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import { ErrorBoundary } from "@/components/error-boundary";
import { ObligationsAndWeek } from "@/components/future/obligations-and-week";
import { TimeScreenV2 } from "@/components/time/time-screen-v2";

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
    <div className="flex flex-col gap-6 pb-28 sm:pb-32">
      {/* Phase 358 — flagship TimeScreen. Hero ring + horizon scrub
         + river + drawer. */}
      <Safe name="TimeScreenV2">
        <TimeScreenV2 />
      </Safe>

      {/* Supporting forecast detail. Sits below the hero so users who
         want raw forecast cards still find them, without competing
         with the hero. */}
      <details className="group rounded-2xl border border-white/8 bg-white/[0.02]" dir="rtl">
        <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-[12.5px] text-foreground/85">
          <span>פירוט תחזית — 35 ימים קדימה</span>
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground transition-transform group-open:rotate-180">
            פתח
          </span>
        </summary>
        <div className="grid grid-cols-1 gap-4 px-3 pb-4 sm:grid-cols-6">
          <div className="sm:col-span-6">
            <Safe name="MonthlyCashflowCard">
              <MonthlyCashflowCard />
            </Safe>
          </div>
          <div className="sm:col-span-6">
            <Safe name="CashflowForecast35">
              <CashflowForecast35 />
            </Safe>
          </div>
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
      </details>
    </div>
  );
}
