"use client";

// Phase 231 — Settings reorganized into a calm consumer surface.
//
// Top of tab: the few cards a regular user actually touches.
// Below that: grouped collapsible accordions for the rest.
// Bottom: Developer Mode toggle that, when on, surfaces the
// technical diagnostics block.
//
// All financial engines unchanged — this is a layout refactor only.

import {
  BellRing,
  CreditCard,
  Database,
  FileDown,
  HandCoins,
  Landmark,
  Lightbulb,
  PiggyBank,
  Repeat,
  ShieldCheck,
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
import { BudgetRecommendationCard } from "./budget-recommendation-card";
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
import { useDevMode } from "@/lib/use-dev-mode";

export function SettingsTab() {
  const { on: devOn } = useDevMode();

  return (
    <div className="flex flex-col gap-4">
      {/* ── Always-visible top stack ──────────────────────────── */}
      <TextSizeCard />
      <AuthCard />
      <BudgetInput />
      <BudgetRecommendationCard />

      {/* ── Data groups (open by default — primary management) ── */}
      <SettingsAccordion
        storageKey="settings.accounts"
        title="חשבונות בנק וכרטיסים"
        subtitle="ניהול יתרות, חיוב יומי וכרטיסים"
        icon={<Landmark className="size-4" />}
        defaultCollapsed={false}
      >
        <AccountsPanel />
      </SettingsAccordion>

      <SettingsAccordion
        storageKey="settings.recurring"
        title="הוצאות קבועות ומנויים"
        subtitle="חיובים חוזרים, מקובצים לפי כרטיס"
        icon={<Repeat className="size-4" />}
        defaultCollapsed={false}
      >
        <RecurringRulesPanel />
      </SettingsAccordion>

      <SettingsAccordion
        storageKey="settings.loans"
        title="הלוואות"
        subtitle="תשלומים חודשיים ויתרה"
        icon={<CreditCard className="size-4" />}
      >
        <LoansPanel />
      </SettingsAccordion>

      <SettingsAccordion
        storageKey="settings.income"
        title="הכנסות"
        subtitle="משכורות, פנסיה והכנסות צפויות"
        icon={<HandCoins className="size-4" />}
      >
        <IncomePanel />
      </SettingsAccordion>

      {/* ── Smart suggestions ─────────────────────────────────── */}
      <SettingsAccordion
        storageKey="settings.suggestions"
        title="הצעות חכמות"
        subtitle="חיובים חוזרים שזוהו, מנויים, סחיפת קצב"
        icon={<Lightbulb className="size-4" />}
      >
        <div className="flex flex-col gap-3">
          <SubscriptionSuggestions />
          <RecurringSuggestionsCard />
          <RuleDriftCard />
          <DormantRulesCard />
        </div>
      </SettingsAccordion>

      {/* ── Notifications ─────────────────────────────────────── */}
      <SettingsAccordion
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

      {/* ── Shortcut (iPhone payment automation) ─────────────── */}
      <SettingsAccordion
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

      {/* ── Import / export ────────────────────────────────────── */}
      <SettingsAccordion
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

      {/* ── Backups ───────────────────────────────────────────── */}
      <SettingsAccordion
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
          storageKey="settings.dev"
          title="אבחון טכני"
          subtitle="Cloud Sync, מזהה מכשיר, יומן Push"
          icon={<ShieldCheck className="size-4" />}
          defaultCollapsed={false}
        >
          <div className="flex flex-col gap-3">
            <CloudSyncCard />
            <IntegrationInfo />
            <PushDiagnosticsCard />
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
