"use client";

// Phase 373 — Expenses detail drawer.
//
// One quiet glass handle at the bottom of the Expenses tab. Tap →
// full-screen bottom-sheet revealing every supporting surface
// (categories / cards / recurring / installments / donut / heatmap).
// Keeps the Expenses tab visually focused on the ObligationsCockpit
// (the answer) while every detail stays one tap away.
//
// Engine + per-card behaviours untouched — this is composition only.

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronUp } from "lucide-react";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { DashboardSection } from "@/components/dashboard/dashboard-section";
import { ErrorBoundary } from "@/components/error-boundary";
import { tap as hapticTap } from "@/lib/haptics";

const lazy = (
  loader: () => Promise<{ default: React.ComponentType<Record<string, unknown>> }>,
) => dynamic(loader, { ssr: false });

const CategorySpendCard = lazy(() =>
  import("@/components/dashboard/category-spend-card").then((m) => ({
    default:
      m.CategorySpendCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);
const CardsHierarchyCard = lazy(() =>
  import("@/components/dashboard/cards-hierarchy-card").then((m) => ({
    default:
      m.CardsHierarchyCard as unknown as React.ComponentType<Record<string, unknown>>,
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

export function ExpenseDetailDrawer() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          hapticTap();
          setOpen(true);
        }}
        dir="rtl"
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3 text-right transition-colors hover:border-white/16"
        aria-label="פירוט מלא של ההוצאות"
      >
        <ChevronUp className="size-4 text-muted-foreground" aria-hidden />
        <span className="flex flex-col gap-0.5">
          <span className="text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground">
            פירוט מלא
          </span>
          <span className="text-[12.5px] text-foreground/80">
            קטגוריות · כרטיסים · הוצאות קבועות · ניתוחים
          </span>
        </span>
      </button>

      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title="פירוט הוצאות"
        fullScreen
      >
        <div className="flex flex-col gap-4 pb-6" dir="rtl">
          <header className="flex flex-col gap-0.5">
            <span className="text-[10.5px] uppercase tracking-[0.3em] text-muted-foreground">
              פירוט הוצאות
            </span>
            <span className="text-[13px] text-muted-foreground/85">
              כל הפירוט בכרטיסיות נפתחות — אחת בכל פעם.
            </span>
          </header>

          <DashboardSection
            storageKey="expenses.drawer.categories"
            title="הוצאות לפי קטגוריה"
            subtitle="חודש נוכחי + שני חודשים אחרונים"
            defaultCollapsed={false}
          >
            <div className="sm:col-span-6">
              <Safe name="CategorySpendCard">
                <CategorySpendCard />
              </Safe>
            </div>
          </DashboardSection>

          <DashboardSection
            storageKey="expenses.drawer.cards"
            title="כרטיסי אשראי"
            subtitle="חיובים לפי כרטיס × חודש"
            defaultCollapsed
          >
            <div className="sm:col-span-6">
              <Safe name="CardsHierarchyCard">
                <CardsHierarchyCard />
              </Safe>
            </div>
          </DashboardSection>

          <DashboardSection
            storageKey="expenses.drawer.recurring"
            title="חיובים שיורדים אוטומטית"
            subtitle="הוצאות קבועות + תשלומים פעילים"
            defaultCollapsed
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

          <DashboardSection
            storageKey="expenses.drawer.analytics"
            title="ניתוחים גרפיים"
            subtitle="דונאט + חום ימי החודש"
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
        </div>
      </BottomSheet>
    </>
  );
}
