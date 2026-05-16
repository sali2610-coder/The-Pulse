"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { projectMonth } from "@/lib/projections";

import { AnimatedBackground } from "@/components/dashboard/animated-background";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { DashboardTab } from "@/components/dashboard/dashboard-tab";
import { AnalyticsTab } from "@/components/analytics/analytics-tab";
import { HistoryTab } from "@/components/history/history-tab";
import { SettingsTab } from "@/components/settings/settings-tab";
import { SetupGuide } from "@/components/setup/setup-guide";
import { SeedPanel } from "@/components/dev/seed-panel";
import { AutoSync } from "@/components/sync/auto-sync";
import { HeaderUser } from "@/components/auth/header-user";

const isDev = process.env.NODE_ENV !== "production";

export default function Home() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  const isOverBudget = useMemo(() => {
    if (!hydrated || monthlyBudget <= 0) return false;
    const { actual } = projectMonth({
      entries,
      rules,
      statuses,
      monthKey: currentMonthKey(),
    });
    return actual > monthlyBudget;
  }, [hydrated, entries, rules, statuses, monthlyBudget]);

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

        <Tabs defaultValue="dashboard">
          <TabsList className="w-full bg-surface/60 backdrop-blur-md">
            <TabsTrigger value="dashboard">לוח</TabsTrigger>
            <TabsTrigger value="analytics">ניתוח</TabsTrigger>
            <TabsTrigger value="history">היסטוריה</TabsTrigger>
            <TabsTrigger value="setup">מדריך</TabsTrigger>
            <TabsTrigger value="settings">הגדרות</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-4">
            <DashboardTab />
          </TabsContent>
          <TabsContent value="analytics" className="mt-4">
            <AnalyticsTab />
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            <HistoryTab />
          </TabsContent>
          <TabsContent value="setup" className="mt-4">
            <SetupGuide />
          </TabsContent>
          <TabsContent value="settings" className="mt-4">
            <SettingsTab />
          </TabsContent>
        </Tabs>
      </div>

      <AutoSync />
      {isDev ? <SeedPanel /> : null}
    </main>
  );
}
