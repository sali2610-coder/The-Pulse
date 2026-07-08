"use client";

// Expenses tab — UX/UI-only rebuild in the Portfolio Home / Time
// Machine visual language (dark glass · gold hairline dividers ·
// tone-tinted chips · premium touch surfaces).
//
// Zero engine / store / calculation / dialog logic touched:
//   • PendingTray, ExpensesCommitmentsCockpit, CategorySpendCard,
//     CardsHierarchyCard, CategoryDonut, HeatmapMini all mount the
//     same components with the same props they had before.
//   • Every existing data path, card-assignment engine, credit
//     logic, and quick-expense wiring is untouched.
//
// What changed here is only:
//   1. Grid rhythm — tighter gaps, sections separated by the same
//      .sally-section-header gold hairline divider used on Home
//      and Time.
//   2. New KPI chip row (ExpensesKpiRow, tone-tinted mini cards)
//      replacing the old dense strip.
//   3. Forecast pointer chip restyled with the same gold accent as
//      Time-tab callouts.

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import { ErrorBoundary } from "@/components/error-boundary";
import { ExpensesCommitmentsCockpit } from "@/components/expenses/expenses-commitments-cockpit";
import { FinancialDebugPanel } from "@/components/dev/financial-debug-panel";
import { FinancialAuditReport } from "@/components/dev/financial-audit-report";

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
    <div className="ex-root pulse-stagger" dir="rtl">
      {/* Pending tray surfaces only when there are items needing
         review. Collapsed via `empty:hidden` when the child renders
         null so the layout stays tight. */}
      <div className="ex-slot empty:hidden">
        <Safe name="PendingTray">
          <PendingTray />
        </Safe>
      </div>

      {/* Hero — same ExpensesCommitmentsCockpit, wrapped in the
         section grid. Zero visual regression inside; only the
         surrounding rhythm was tightened. */}
      <div className="ex-slot empty:hidden">
        <Safe name="ExpensesCommitmentsCockpit">
          <ExpensesCommitmentsCockpit />
        </Safe>
      </div>

      {/* KPI chip row + "תחזית סוף החודש חיה בלשונית זמן" pointer
         removed — the row (חיובים על הכרטיסים / תשלומים פתוחים /
         SMS יבוא / Wallet / תיעוד ידני / ממתינים לאישור) and the
         forecast pointer were adding noise without decisions. All
         underlying data lives on Home / Time / Settings and the
         engine still exposes every count via ExpensesKpiRow for
         future callers. This tab renders only the sections that
         drive user action. */}

      <SectionHeader
        title="לאן הולך הכסף"
        subtitle="פילוח לפי קטגוריה — כולל תשלומים פרוסים"
      />
      <div className="ex-slot">
        <Safe name="CategorySpendCard">
          <CategorySpendCard />
        </Safe>
      </div>

      <SectionHeader
        title="חלוקה לפי כרטיסי אשראי"
        subtitle="לחץ כרטיס לפתיחת פירוט חיובים · מסגרת · לחץ"
      />
      <div className="ex-slot">
        <Safe name="CardsHierarchyCard">
          <CardsHierarchyCard />
        </Safe>
      </div>

      <SectionHeader
        title="ניתוחים גרפיים"
        subtitle="פילוח קטגוריות + מפת חום ימי החודש — אינטראקטיביים"
      />
      <div className="ex-analytics">
        <div className="ex-slot">
          <Safe name="CategoryDonut">
            <CategoryDonut />
          </Safe>
        </div>
        <div className="ex-slot">
          <Safe name="HeatmapMini">
            <HeatmapMini />
          </Safe>
        </div>
      </div>

      {process.env.NODE_ENV !== "production" ? (
        <div className="ex-slot">
          <Safe name="FinancialDebugPanel">
            <FinancialDebugPanel />
          </Safe>
          <Safe name="FinancialAuditReport">
            <FinancialAuditReport />
          </Safe>
        </div>
      ) : null}
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <header className="sally-section-header" dir="rtl" aria-label={title}>
      <div className="sally-section-header-text">
        <span className="sally-section-header-title">{title}</span>
        <span className="sally-section-header-sub">{subtitle}</span>
      </div>
      <span aria-hidden className="sally-section-header-divider" />
    </header>
  );
}

