"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { projectMonth } from "@/lib/projections";
import {
  subscribeTabNav,
  tabFromHash,
  type TabId,
} from "@/lib/tab-nav";
import { gatherSmartInsights } from "@/lib/smart-insights";
import { subscribeInsightDismissals } from "@/lib/insight-dismiss";
import { useAutoBackup } from "@/lib/auto-backup";
import { useStoreMutationBridge } from "@/lib/store-mutation-bridge";
import { CloudSyncProvider } from "@/lib/supabase/cloud-sync-context";
import { installGlobalErrorHandlers } from "@/lib/error-log";
import { installWebVitals } from "@/lib/web-vitals";

import { AnimatedBackground } from "@/components/dashboard/animated-background";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { DashboardTab } from "@/components/dashboard/dashboard-tab";
import { ExpensesTab } from "@/components/expenses/expenses-tab";
import { FutureTab } from "@/components/future/future-tab";
import { InsightsTab } from "@/components/insights/insights-tab";
import { SettingsTab } from "@/components/settings/settings-tab";
import { SeedPanel } from "@/components/dev/seed-panel";
import { AutoSync } from "@/components/sync/auto-sync";
import { HeaderUser } from "@/components/auth/header-user";
import { ErrorBoundary, PageFallback } from "@/components/error-boundary";
import { PendingConfirmListener } from "@/components/app/pending-confirm-listener";
import { PendingConfirmOverlay } from "@/components/confirmation/pending-confirm-overlay";

const isDev = process.env.NODE_ENV !== "production";

// The full Sally app — tabs, dashboard, sync, dev tools. Rendered only when
// auth is either disabled (single-user fallback) or the user is signed in.
// The server-side <Home /> chooses between this and the welcome screen.
export function AppShell() {
  return (
    <ErrorBoundary name="AppShell" fallback={<PageFallback />}>
      <CloudSyncProvider>
        <AppShellContent />
      </CloudSyncProvider>
    </ErrorBoundary>
  );
}

function AppShellContent() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const accounts = useFinanceStore((s) => s.accounts);
  const incomes = useFinanceStore((s) => s.incomes);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);
  const budgetMode = useFinanceStore((s) => s.budgetMode);

  useAutoBackup();
  useStoreMutationBridge();
  useEffect(() => installGlobalErrorHandlers(), []);
  useEffect(() => installWebVitals(), []);

  const [activeTab, setActiveTab] = useState<TabId>(() => {
    if (typeof window === "undefined") return "dashboard";
    return tabFromHash(window.location.hash) ?? "dashboard";
  });

  // Hash change + in-app nav listeners. Initial hash is read by the
  // useState lazy initializer above so we don't setState in effect.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHashChange = () => {
      const next = tabFromHash(window.location.hash);
      if (next) setActiveTab(next);
    };
    window.addEventListener("hashchange", onHashChange);
    const unsubNav = subscribeTabNav(({ tab: next, section }) => {
      setActiveTab(next);
      if (next === "dashboard") {
        if (window.location.hash) {
          window.history.replaceState(
            null,
            "",
            window.location.pathname + window.location.search,
          );
        }
      } else if (window.location.hash !== `#${next}`) {
        window.history.replaceState(null, "", `#${next}`);
      }
      if (section) {
        // Tab content mounts on the next tick — give it a frame, then
        // scroll the named card into view. Smooth-behavior so the user
        // visually traces the source of the navigation.
        requestAnimationFrame(() => {
          const el = document.querySelector(
            `[data-section="${section}"]`,
          );
          if (el && "scrollIntoView" in el) {
            (el as HTMLElement).scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }
        });
      }
    });
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      unsubNav();
    };
  }, []);

  // Phase 266 — Manual: compare against the user-typed cap. Auto:
  // there's no fixed cap the user committed to, so the ambient
  // "over budget" highlight stays off.
  const isOverBudget = useMemo(() => {
    if (!hydrated) return false;
    if (budgetMode !== "manual") return false;
    if (monthlyBudget <= 0) return false;
    const { actual } = projectMonth({
      entries,
      rules,
      statuses,
      monthKey: currentMonthKey(),
    });
    return actual > monthlyBudget;
  }, [hydrated, entries, rules, statuses, monthlyBudget, budgetMode]);

  const [dismissTick, setDismissTick] = useState(0);
  useEffect(() => {
    return subscribeInsightDismissals(() =>
      setDismissTick((t) => t + 1),
    );
  }, []);

  const insightCount = useMemo(() => {
    if (!hydrated) return 0;
    void dismissTick;
    return gatherSmartInsights({
      entries,
      rules,
      statuses,
      accounts,
      incomes,
      monthlyBudget,
      budgetMode,
      monthKey: currentMonthKey(),
    }).total;
  }, [
    hydrated,
    entries,
    rules,
    statuses,
    accounts,
    incomes,
    monthlyBudget,
    budgetMode,
    dismissTick,
  ]);

  const pendingCount = useMemo(() => {
    if (!hydrated) return 0;
    let n = 0;
    for (const e of entries) {
      if (e.needsConfirmation && !e.confirmedAt) n += 1;
    }
    return n;
  }, [hydrated, entries]);

  return (
    <main
      data-danger={isOverBudget ? "true" : undefined}
      className="relative flex flex-1 flex-col items-stretch px-5 pb-10 pt-safe sm:items-center"
      style={{ paddingTop: "max(env(safe-area-inset-top), 2.5rem)" }}
    >
      <AnimatedBackground />

      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-start justify-between gap-3"
        >
          <div className="flex flex-col gap-1 text-right">
            <span className="text-xs uppercase tracking-[0.3em] text-gold/80">
              Sally
            </span>
            <h1 className="text-2xl font-light leading-tight tracking-tight text-foreground sm:text-3xl">
              תקציב נקי, החלטות חכמות.
            </h1>
          </div>
          <HeaderUser />
        </motion.header>

        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            if (typeof v === "string") {
              setActiveTab(v as TabId);
              if (typeof window !== "undefined") {
                if (v === "dashboard") {
                  if (window.location.hash) {
                    window.history.replaceState(
                      null,
                      "",
                      window.location.pathname + window.location.search,
                    );
                  }
                } else if (window.location.hash !== `#${v}`) {
                  window.history.replaceState(null, "", `#${v}`);
                }
              }
            }
          }}
        >
          {/* Phase 254 — 5-tab consumer hierarchy.
              IDs preserved for hash-link backward compatibility; the
              content + labels are remapped. */}
          <TabsList className="w-full bg-surface/60 backdrop-blur-md">
            <TabsTrigger value="dashboard">
              <span className="relative inline-flex items-center gap-1">
                בית
                {pendingCount > 0 ? (
                  <span
                    aria-label={`${pendingCount} חיובים ממתינים לאישור`}
                    className="inline-flex min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[9px] font-bold text-[#050505] tabular-nums leading-none"
                    style={{ height: 16 }}
                    data-mono="true"
                  >
                    {pendingCount > 9 ? "9+" : pendingCount}
                  </span>
                ) : null}
              </span>
            </TabsTrigger>
            <TabsTrigger value="analytics">הוצאות</TabsTrigger>
            <TabsTrigger value="history">עתידי</TabsTrigger>
            <TabsTrigger value="setup">
              <span className="relative inline-flex items-center gap-1">
                תובנות
                {insightCount > 0 ? (
                  <span
                    aria-label={`${insightCount} תובנות ממתינות`}
                    className="inline-flex min-w-4 items-center justify-center rounded-full bg-neon px-1 text-[9px] font-bold text-[#050505] tabular-nums leading-none"
                    style={{ height: 16 }}
                    data-mono="true"
                  >
                    {insightCount > 9 ? "9+" : insightCount}
                  </span>
                ) : null}
              </span>
            </TabsTrigger>
            <TabsTrigger value="settings">הגדרות</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-4">
            <ErrorBoundary name="DashboardTab">
              <DashboardTab />
            </ErrorBoundary>
          </TabsContent>
          <TabsContent value="analytics" className="mt-4">
            <ErrorBoundary name="ExpensesTab">
              <ExpensesTab />
            </ErrorBoundary>
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            <ErrorBoundary name="FutureTab">
              <FutureTab />
            </ErrorBoundary>
          </TabsContent>
          <TabsContent value="setup" className="mt-4">
            <ErrorBoundary name="InsightsTab">
              <InsightsTab />
            </ErrorBoundary>
          </TabsContent>
          <TabsContent value="settings" className="mt-4">
            <ErrorBoundary name="SettingsTab">
              <SettingsTab />
            </ErrorBoundary>
          </TabsContent>
        </Tabs>
      </div>

      <AutoSync />
      <PendingConfirmListener />
      <PendingConfirmOverlay />
      {isDev ? <SeedPanel /> : null}
    </main>
  );
}
