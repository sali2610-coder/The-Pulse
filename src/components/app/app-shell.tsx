"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { projectMonth } from "@/lib/projections";
import {
  isTabId,
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
import { resetAllCollapseState } from "@/lib/dashboard-section-store";
import { flushBudgetSettings } from "@/lib/budget-settings-flush";
import {
  AttentionCenter,
  useAttentionCount,
} from "@/components/dashboard/attention-center";

import { AnimatedBackground } from "@/components/dashboard/animated-background";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TabPager } from "@/components/app/tab-pager";
import { soft as hapticSoft, tap as hapticTap } from "@/lib/haptics";

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

/** Tab order for the swipe pager. Matches the visual right-to-left
 *  order of the TabsList in the header. */
const TAB_ORDER: TabId[] = [
  "dashboard",
  "analytics",
  "history",
  "setup",
  "settings",
];

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
  // Phase 288 — startup pending-push retry. If the previous session
  // wrote a budget / text-scale change locally but the cloud upsert
  // didn't land (RLS, offline), the timestamp is strictly newer than
  // the last successful cloud round-trip. Re-flush once on mount so
  // the user's choice eventually catches up without them having to
  // re-toggle the setting.
  useEffect(() => {
    if (!hydrated) return;
    const st = useFinanceStore.getState();
    const budgetPending =
      st.budgetSettingsUpdatedAt > (st.budgetSettingsCloudAt ?? 0);
    const textScalePending =
      st.textScaleUpdatedAt > (st.textScaleCloudAt ?? 0);
    if (budgetPending || textScalePending) {
      void flushBudgetSettings();
    }
  }, [hydrated]);

  const [activeTab, setActiveTab] = useState<TabId>(() => {
    if (typeof window === "undefined") return "dashboard";
    return tabFromHash(window.location.hash) ?? "dashboard";
  });

  // Central tab-change handler. Both the tab-bar clicks and swipe
  // gestures route through here so hash sync, collapse reset and
  // haptic feedback stay identical between input methods.
  function handleTabChange(next: TabId, source: "click" | "swipe") {
    if (next === activeTab) return;
    setActiveTab(next);
    resetAllCollapseState();
    if (source === "click") hapticTap();
    if (typeof window !== "undefined") {
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
    }
  }

  // Hash change + in-app nav listeners. Initial hash is read by the
  // useState lazy initializer above so we don't setState in effect.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHashChange = () => {
      const next = tabFromHash(window.location.hash);
      if (next) {
        setActiveTab(next);
        resetAllCollapseState();
      }
    };
    window.addEventListener("hashchange", onHashChange);
    // Phase 271 — leaving the tab (browser hidden) wipes collapse state
    // so coming back lands on the calm, summary-first surface.
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        resetAllCollapseState();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    const unsubNav = subscribeTabNav(({ tab: next, section }) => {
      setActiveTab(next);
      resetAllCollapseState();
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
      document.removeEventListener("visibilitychange", onVisibility);
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

  // Phase 294 — Home-tab badge represents the Attention Center
  // count: pending confirmations + top AI risks + recurring review
  // items. Tapping the tab navigates to Home; from there the user
  // hits the "מרכז תשומת הלב" banner at the top to open the sheet.
  const attentionCount = useAttentionCount();
  void pendingCount;

  return (
    <main
      data-danger={isOverBudget ? "true" : undefined}
      className="relative flex flex-1 flex-col items-stretch px-5 pb-10 pt-safe sm:items-center"
      // Phase 276 — tightened top breathing room. Safe-area floor cut
      // from 2.5rem → 1.25rem so the header doesn't float when the
      // device has no notch.
      style={{ paddingTop: "max(env(safe-area-inset-top), 1.25rem)" }}
    >
      <AnimatedBackground />

      {/* Phase 276 — unified vertical rhythm. Outer gap-3 between
         the brand header and the tabs, then TabsContent picks up the
         tightened mt-2 (was mt-4) so the first card sits visually
         connected to the nav. */}
      <div className="mx-auto flex w-full max-w-md flex-col gap-3">
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
            if (typeof v === "string" && isTabId(v)) {
              handleTabChange(v, "click");
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
                {attentionCount > 0 ? (
                  <span
                    aria-label={`${attentionCount} פריטים דורשים תשומת לב`}
                    className="inline-flex min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[9px] font-bold text-[#050505] tabular-nums leading-none"
                    style={{ height: 16 }}
                    data-mono="true"
                  >
                    {attentionCount > 9 ? "9+" : attentionCount}
                  </span>
                ) : null}
              </span>
            </TabsTrigger>
            <TabsTrigger value="analytics">הוצאות</TabsTrigger>
            <TabsTrigger value="history">זמן</TabsTrigger>
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
        </Tabs>

        {/* Swipeable pager. All 5 panels stay mounted — state,
           scroll, hooks preserved. Drag > 35% of viewport OR
           |velocity| > 500 px/s completes the transition; tap on
           TabsList feeds through the same activeTab state so the
           spring animation plays either way. */}
        <div className="tp-outer mt-2">
          <TabPager
            activeIndex={TAB_ORDER.indexOf(activeTab)}
            onIndexChange={(i) => handleTabChange(TAB_ORDER[i], "swipe")}
            onDragSelect={() => hapticSoft()}
          >
            <ErrorBoundary name="DashboardTab">
              <DashboardTab />
            </ErrorBoundary>
            <ErrorBoundary name="ExpensesTab">
              <ExpensesTab />
            </ErrorBoundary>
            <ErrorBoundary name="FutureTab">
              <FutureTab />
            </ErrorBoundary>
            <ErrorBoundary name="InsightsTab">
              <InsightsTab />
            </ErrorBoundary>
            <ErrorBoundary name="SettingsTab">
              <SettingsTab />
            </ErrorBoundary>
          </TabPager>
        </div>
      </div>

      <AutoSync />
      <PendingConfirmListener />
      <PendingConfirmOverlay />
      <AttentionCenter />
      {isDev ? <SeedPanel /> : null}
    </main>
  );
}
