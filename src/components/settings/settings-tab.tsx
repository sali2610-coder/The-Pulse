"use client";

import { BudgetInput } from "./budget-input";
import { IntegrationInfo } from "./integration-info";
import { StatementImport } from "./statement-import";
import { AudioToggle } from "./audio-toggle";
import { PushToggle } from "./push-toggle";
import { AuthCard } from "./auth-card";
// DeviceRecoveryCard is no longer mounted as a top-level container.
// BackupsCard renders it inside "אפשרויות מתקדמות" so the user sees
// one unified backup surface. The component file is intentionally
// preserved — no logic was deleted.
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

export function SettingsTab() {
  return (
    <div className="flex flex-col gap-4">
      <AuthCard />
      <CloudSyncCard />
      <BackupsCard />
      <BudgetRecommendationCard />
      <BudgetInput />
      <IntegrationInfo />
      <PushToggle />
      <AudioToggle />
      <Section title="חשבונות" section="accounts">
        <AccountsPanel />
      </Section>
      <SubscriptionSuggestions />
      <RuleDriftCard />
      <DormantRulesCard />
      <Section title="הוצאות וחיובים קבועים" section="recurring-rules">
        <RecurringRulesPanel />
      </Section>
      <Section title="הלוואות" section="loans">
        <LoansPanel />
      </Section>
      <Section title="הכנסות" section="incomes">
        <IncomePanel />
      </Section>
      <StatementImport />
    </div>
  );
}

function Section({
  title,
  section,
  children,
}: {
  title: string;
  section?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-section={section}
      className="rounded-2xl border border-border/60 bg-surface/50 p-5 backdrop-blur-md"
    >
      <header className="mb-4">
        <div className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          {title}
        </div>
      </header>
      {children}
    </section>
  );
}
