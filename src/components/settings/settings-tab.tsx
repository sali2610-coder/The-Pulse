"use client";

// Phase 231 — Settings reorganized into a calm consumer surface.
// Phase 332 — collapsed-by-default accordions with one-open mutex.
//
// Top of tab: compact identity row (TextSize + Auth).
// Below: a flat list of accordion folders. Exactly one folder is
// open at a time; opening another auto-closes the current one. The
// active section id is persisted to localStorage so a reload (or
// tab switch) reopens the last folder the user was reading.

import { useState } from "react";
import {
  BellRing,
  CalendarRange,
  CreditCard,
  Database,
  FileDown,
  HandCoins,
  Landmark,
  Lightbulb,
  ListChecks,
  PiggyBank,
  Repeat,
  ShieldCheck,
  Target,
} from "lucide-react";

import { BudgetInput } from "./budget-input";
import { IntegrationInfo } from "./integration-info";
import { StatementImport } from "./statement-import";
import { AudioToggle } from "./audio-toggle";
import { PushToggle } from "./push-toggle";
import { IphonePushOnboardingCard } from "./iphone-push-onboarding-card";
import { AuthCard } from "./auth-card";
import { AccountsPanel } from "@/components/accounts/accounts-panel";
import { LoansPanel } from "@/components/loans/loans-panel";
import { IncomePanel } from "@/components/income/income-panel";
import { RecurringRulesPanel } from "@/components/recurring/recurring-rules-panel";
import { SubscriptionSuggestions } from "./subscription-suggestions";
import { RuleDriftCard } from "./rule-drift-card";
import { DormantRulesCard } from "./dormant-rules-card";
import { BackupsCard } from "./backups-card";
import { CloudSyncCard } from "./cloud-sync-card";
import { RecurringSuggestionsCard } from "./recurring-suggestions-card";
import { ReceiptScanCard } from "./receipt-scan-card";
import { PushDiagnosticsCard } from "./push-diagnostics-card";
import { SallyCsvImportCard } from "./sally-csv-import-card";
import { TextSizeCard } from "./text-size-card";
import { DevModeToggleCard } from "./dev-mode-toggle-card";
import { SettingsAccordion } from "./settings-accordion";
import { ShortcutHealthCard } from "./shortcut-health-card";
import { ShortcutOnboardingCard } from "./shortcut-onboarding-card";
import { PushDeliveryMatrix } from "./push-delivery-matrix";
import { BudgetSettingsDiagnostics } from "./budget-settings-diagnostics";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { useDevMode } from "@/lib/use-dev-mode";

const ACTIVE_KEY = "sally.settings.openSection.v1";

function readActive(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

function writeActive(next: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (next === null) window.localStorage.removeItem(ACTIVE_KEY);
    else window.localStorage.setItem(ACTIVE_KEY, next);
  } catch {
    /* ignore — private mode */
  }
}

export function SettingsTab() {
  const { on: devOn } = useDevMode();
  // Lazy initial state reads localStorage exactly once — no effect,
  // no React-19 set-state-in-effect lint trip.
  const [openKey, setOpenKey] = useState<string | null>(() => readActive());

  function handleToggle(next: string | null) {
    setOpenKey(next);
    writeActive(next);
  }

  const mutex = {
    mutexOpenKey: openKey,
    onMutexToggle: handleToggle,
  } as const;

  return (
    <div className="flex flex-col gap-3">
      {/* Compact identity row — text size + auth share a slim band so
         the accordion list starts higher on screen. */}
      <div className="flex flex-col gap-2">
        <TextSizeCard />
        <AuthCard />
      </div>

      {/* ── User-requested accordion order ───────────────────── */}
      <SettingsAccordion
        {...mutex}
        storageKey="settings.accounts"
        title="חשבונות בנק וכרטיסים"
        subtitle="ניהול יתרות, חיוב יומי וכרטיסים"
        icon={<Landmark className="size-4" />}
      >
        <AccountsPanel />
      </SettingsAccordion>

      <SettingsAccordion
        {...mutex}
        storageKey="settings.recurring"
        title="הוצאות קבועות ומנויים"
        subtitle="חיובים חוזרים, מקובצים לפי כרטיס"
        icon={<Repeat className="size-4" />}
      >
        <RecurringRulesPanel />
      </SettingsAccordion>

      <SettingsAccordion
        {...mutex}
        storageKey="settings.loans"
        title="הלוואות"
        subtitle="תשלומים חודשיים ויתרה"
        icon={<CreditCard className="size-4" />}
      >
        <LoansPanel />
      </SettingsAccordion>

      <SettingsAccordion
        {...mutex}
        storageKey="settings.income"
        title="הכנסות"
        subtitle="משכורות, פנסיה והכנסות צפויות"
        icon={<HandCoins className="size-4" />}
      >
        <IncomePanel />
      </SettingsAccordion>

      <SettingsAccordion
        {...mutex}
        storageKey="settings.budget-control"
        title="בקרת תקציב אוטומטית"
        subtitle="חישוב שקט ברקע אחרי כל פעולה"
        icon={<Target className="size-4" />}
      >
        <BudgetInput />
      </SettingsAccordion>

      <SettingsAccordion
        {...mutex}
        storageKey="settings.smart-suggestions"
        title="הצעות חכמות"
        subtitle="חיובים חוזרים שזוהו ושחיקת קצב"
        icon={<Lightbulb className="size-4" />}
      >
        <div className="flex flex-col gap-3">
          <RecurringSuggestionsCard />
          <RuleDriftCard />
        </div>
      </SettingsAccordion>

      <SettingsAccordion
        {...mutex}
        storageKey="settings.checks-subs"
        title="בדיקות ומנויים"
        subtitle="מנויים שזוהו וכללים רדומים"
        icon={<ListChecks className="size-4" />}
      >
        <div className="flex flex-col gap-3">
          <SubscriptionSuggestions />
          <DormantRulesCard />
        </div>
      </SettingsAccordion>

      <SettingsAccordion
        {...mutex}
        storageKey="settings.month-activity"
        title="פעילות החודש"
        subtitle="כל מה שזז החודש — הוצאות והכנסות"
        icon={<CalendarRange className="size-4" />}
      >
        <RecentActivity />
      </SettingsAccordion>

      {/* ── Secondary / system folders ─────────────────────── */}
      <SettingsAccordion
        {...mutex}
        storageKey="settings.notifications"
        title="התראות"
        subtitle="Web Push, אישור הוצאה ב-iPhone, צליל"
        icon={<BellRing className="size-4" />}
      >
        <div className="flex flex-col gap-3">
          <IphonePushOnboardingCard />
          <PushToggle />
          <AudioToggle />
          <PushDeliveryMatrix />
        </div>
      </SettingsAccordion>

      <SettingsAccordion
        {...mutex}
        storageKey="settings.shortcut"
        title="קיצור iPhone — קליטה אוטומטית"
        subtitle="חיבור Apple Pay / כרטיסי האשראי לזרימה ב-Pulse"
        icon={<BellRing className="size-4" />}
      >
        <div className="flex flex-col gap-3">
          <ShortcutOnboardingCard />
          <ShortcutHealthCard />
        </div>
      </SettingsAccordion>

      <SettingsAccordion
        {...mutex}
        storageKey="settings.io"
        title="ייבוא וייצוא"
        subtitle="דפי חיוב, גיבוי Sally, ניתוח קבלות"
        icon={<FileDown className="size-4" />}
      >
        <div className="flex flex-col gap-3">
          <StatementImport />
          <SallyCsvImportCard />
          <ReceiptScanCard />
        </div>
      </SettingsAccordion>

      <SettingsAccordion
        {...mutex}
        storageKey="settings.backups"
        title="גיבויים"
        subtitle="גיבוי מקומי + ענן, התאוששות"
        icon={<PiggyBank className="size-4" />}
      >
        <BackupsCard />
      </SettingsAccordion>

      {/* ── Developer toggle + (conditional) tech block ──────── */}
      <DevModeToggleCard />

      {devOn ? (
        <SettingsAccordion
          {...mutex}
          storageKey="settings.dev"
          title="אבחון טכני"
          subtitle="Cloud Sync, מזהה מכשיר, יומן Push"
          icon={<ShieldCheck className="size-4" />}
        >
          <div className="flex flex-col gap-3">
            <CloudSyncCard />
            <IntegrationInfo />
            <PushDiagnosticsCard />
            <BudgetSettingsDiagnostics />
          </div>
        </SettingsAccordion>
      ) : (
        <p className="px-2 text-[11px] text-muted-foreground/60">
          הפעל מצב פיתוח כדי לראות יומני Cloud Sync, מזהה מכשיר ו-Push.
        </p>
      )}

      {/* Reserved for future debug seam — keeps the import alive. */}
      {false ? <Database className="size-3" /> : null}
    </div>
  );
}
