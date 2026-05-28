"use client";

// Phase 254 — "עתידי" tab.
//
// Forward-looking surfaces: the main future-balance hero, liquidity
// curve, upcoming outflows, cash-flow buckets, anchor trajectory.
// Composition only — engines unchanged.

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import { ErrorBoundary } from "@/components/error-boundary";

const lazy = (
  loader: () => Promise<{ default: React.ComponentType<Record<string, unknown>> }>,
) => dynamic(loader, { ssr: false });

const HeroFutureBalanceCard = lazy(() =>
  import("@/components/dashboard/simple/hero-future-balance-card").then(
    (m) => ({
      default:
        m.HeroFutureBalanceCard as unknown as React.ComponentType<Record<string, unknown>>,
    }),
  ),
);
const LiquidityCurveCard = lazy(() =>
  import("@/components/dashboard/liquidity-curve-card").then((m) => ({
    default:
      m.LiquidityCurveCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const CashflowBucketsCard = lazy(() =>
  import("@/components/dashboard/cashflow-buckets-card").then((m) => ({
    default:
      m.CashflowBucketsCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const UpcomingOutflowsCard = lazy(() =>
  import("@/components/dashboard/upcoming-outflows-card").then((m) => ({
    default:
      m.UpcomingOutflowsCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const ForecastTimelineCard = lazy(() =>
  import("@/components/dashboard/forecast-timeline-card").then((m) => ({
    default:
      m.ForecastTimelineCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const AnchorTrajectoryCard = lazy(() =>
  import("@/components/dashboard/anchor-trajectory-card").then((m) => ({
    default:
      m.AnchorTrajectoryCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

function Safe({ name, children }: { name: string; children: ReactNode }) {
  return <ErrorBoundary name={name}>{children}</ErrorBoundary>;
}

export function FutureTab() {
  return (
    <div className="grid grid-cols-1 gap-5 pb-28 sm:grid-cols-6 sm:gap-5 sm:pb-32">
      <div className="sm:col-span-6">
        <Safe name="HeroFutureBalanceCard">
          <HeroFutureBalanceCard />
        </Safe>
      </div>
      <div className="sm:col-span-6">
        <Safe name="LiquidityCurveCard">
          <LiquidityCurveCard />
        </Safe>
      </div>
      <div className="sm:col-span-6">
        <Safe name="CashflowBucketsCard">
          <CashflowBucketsCard />
        </Safe>
      </div>
      <div className="sm:col-span-6">
        <Safe name="UpcomingOutflowsCard">
          <UpcomingOutflowsCard />
        </Safe>
      </div>
      <div className="sm:col-span-6">
        <Safe name="ForecastTimelineCard">
          <ForecastTimelineCard />
        </Safe>
      </div>
      <div className="sm:col-span-6">
        <Safe name="AnchorTrajectoryCard">
          <AnchorTrajectoryCard />
        </Safe>
      </div>
    </div>
  );
}
