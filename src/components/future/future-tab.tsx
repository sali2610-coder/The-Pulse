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
import { TimeScreenV3 } from "@/components/time/time-screen-v3";

const lazy = (
  loader: () => Promise<{ default: React.ComponentType<Record<string, unknown>> }>,
) => dynamic(loader, { ssr: false });

// Phase — 'תחזית תזרים חכמה' (CashflowForecast35) + 'ציר זמן צפוי
// החודש' (ForecastTimelineCard) unmounted from the Time tab. Both
// duplicated data the TimeScreenV3 hero + insight tiles already
// present. Component files remain on disk for other surfaces.
// Phase — MonthlyCashflowCard + ObligationsAndWeek also unmounted
// here to remove the last container of redundant supporting cards.
const MonthlyCashflowCard = lazy(() =>
  import("@/components/dashboard/monthly-cashflow-card").then((m) => ({
    default:
      m.MonthlyCashflowCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const ObligationsAndWeek = lazy(() =>
  import("@/components/future/obligations-and-week").then((m) => ({
    default:
      m.ObligationsAndWeek as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

function Safe({ name, children }: { name: string; children: ReactNode }) {
  return <ErrorBoundary name={name}>{children}</ErrorBoundary>;
}

export function FutureTab() {
  return (
    <div className="flex flex-col gap-6 pb-28 sm:pb-32">
      <Safe name="TimeScreenV3">
        <TimeScreenV3 />
      </Safe>

      {/* Supporting forecast detail — kept behind a details toggle,
         but the two cards the user called out as redundant
         (CashflowForecast35 = 'תחזית תזרים חכמה' + ForecastTimelineCard
         = 'ציר זמן צפוי החודש') are gone. */}
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
            <Safe name="ObligationsAndWeek">
              <ObligationsAndWeek />
            </Safe>
          </div>
        </div>
      </details>
    </div>
  );
}
