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
  Bell,
  BellRing,
  CreditCard,
  Database,
  FileDown,
  HandCoins,
  Landmark,
  PiggyBank,
  Repeat,
  ShieldCheck,
  Target,
} from "lucide-react";

import { BudgetMiniApp } from "./budget-mini-app";
import { IntegrationInfo } from "./integration-info";
import { StatementImport } from "./statement-import";
import { AudioToggle } from "./audio-toggle";
import { PushToggle } from "./push-toggle";
import { IphonePushOnboardingCard } from "./iphone-push-onboarding-card";
// AuthCard now rendered inside SettingsControlRow's account sheet.
import { AccountsMiniApp } from "@/components/accounts/accounts-mini-app";
import { LoansMiniApp } from "@/components/loans/loans-mini-app";
import { NotificationsMiniApp } from "@/components/settings/notifications-mini-app";
import { ShortcutMiniApp } from "@/components/settings/shortcut-mini-app";
import { IncomeMiniApp } from "@/components/income/income-mini-app";
import { RecurringMiniApp } from "@/components/recurring/recurring-mini-app";
import { AlertsCenter } from "./alerts-center";
import { BackupsCard } from "./backups-card";
import { CloudSyncCard } from "./cloud-sync-card";
import { ReceiptScanCard } from "./receipt-scan-card";
import { PushDiagnosticsCard } from "./push-diagnostics-card";
import { SallyCsvImportCard } from "./sally-csv-import-card";
// TextSizeCard + ThemeCard now render inside SettingsControlRow.
import { SettingsControlRow } from "./settings-control-row";
import { DevModeToggleCard } from "./dev-mode-toggle-card";
import { SettingsAccordion } from "./settings-accordion";
import { ShortcutHealthCard } from "./shortcut-health-card";
import { ShortcutOnboardingCard } from "./shortcut-onboarding-card";
import { PushDeliveryMatrix } from "./push-delivery-matrix";
import { BudgetSettingsDiagnostics } from "./budget-settings-diagnostics";
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
      {/* Compact control row — three glass tiles for text size,
         theme, and account. Each opens a BottomSheet with the
         original card component. UI-only; logic + persistence
         paths untouched. */}
      <SettingsControlRow />

      {/* ── User-requested accordion order ───────────────────── */}
      <SettingsAccordion
        {...mutex}
        storageKey="settings.accounts"
        title="חשבונות בנק וכרטיסים"
        subtitle="ניהול יתרות, חיוב יומי וכרטיסים"
        icon={<Landmark className="size-4" />}
      >
        {/* Phase 412 — bank + cards split into two visual sections. */}
        <AccountsMiniApp />
      </SettingsAccordion>

      <SettingsAccordion
        {...mutex}
        storageKey="settings.recurring"
        title="הוצאות קבועות ומנויים"
        subtitle="חיובים חוזרים, מקובצים לפי כרטיס"
        icon={<Repeat className="size-4" />}
      >
        {/* Phase 413 — flat list mini-app w/ source chips + countdown. */}
        <RecurringMiniApp />
      </SettingsAccordion>

      <SettingsAccordion
        {...mutex}
        storageKey="settings.loans"
        title="הלוואות"
        subtitle="תשלומים חודשיים ויתרה"
        icon={<CreditCard className="size-4" />}
      >
        {/* Phase 410 — mini-app pilot. Replaces the admin-style
           LoansPanel with a premium Loan Manager view. The legacy
           panel stays in the codebase for the dashboard until that
           caller migrates. */}
        <LoansMiniApp />
      </SettingsAccordion>

      <SettingsAccordion
        {...mutex}
        storageKey="settings.income"
        title="הכנסות"
        subtitle="משכורות, פנסיה והכנסות צפויות"
        icon={<HandCoins className="size-4" />}
      >
        {/* Phase 414 — variance KPIs + mark-as-received CTA + fullscreen edit. */}
        <IncomeMiniApp />
      </SettingsAccordion>

      <SettingsAccordion
        {...mutex}
        storageKey="settings.budget-control"
        title="בקרת תקציב אוטומטית"
        subtitle="חישוב שקט ברקע אחרי כל פעולה"
        icon={<Target className="size-4" />}
      >
        {/* Phase 415 — live dashboard, not a form. */}
        <BudgetMiniApp />
      </SettingsAccordion>

      {/* Smart Alerts Center — auto-generated feed sourced from
         the existing engine detectors. No filters, no approval
         flow, no manual settings. */}
      <SettingsAccordion
        {...mutex}
        storageKey="settings.alerts-center"
        title="מרכז התראות חכם"
        subtitle="חיובים חריגים, יעדים, חריגות תקציב — אוטומטי"
        icon={<Bell className="size-4" />}
      >
        <AlertsCenter />
      </SettingsAccordion>

      {/* Phase 417 — "פעילות החודש" removed from Settings. The
         identical RecentActivity widget already lives on the Home
         tab; Settings duplicated it without adding context. */}

      {/* ── Secondary / system folders ─────────────────────── */}
      <SettingsAccordion
        {...mutex}
        storageKey="settings.notifications"
        title="התראות"
        subtitle="Web Push, אישור הוצאה ב-iPhone, צליל"
        icon={<BellRing className="size-4" />}
      >
        {/* Phase 411 — mini-app: status hero + existing toggle cards +
           diagnostics under a disclosure. */}
        <NotificationsMiniApp />
      </SettingsAccordion>

      <SettingsAccordion
        {...mutex}
        storageKey="settings.shortcut"
        title="קיצור iPhone — קליטה אוטומטית"
        subtitle="חיבור Apple Pay / כרטיסי האשראי לזרימה ב-Pulse"
        icon={<BellRing className="size-4" />}
      >
        {/* Phase 411 — mini-app: status hero + health card + onboarding. */}
        <ShortcutMiniApp />
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
