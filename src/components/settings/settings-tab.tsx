"use client";

import { BudgetInput } from "./budget-input";
import { IntegrationInfo } from "./integration-info";
import { StatementImport } from "./statement-import";
import { AudioToggle } from "./audio-toggle";
import { PushToggle } from "./push-toggle";
import { ApiTokenCard } from "./api-token-card";
import { AccountsPanel } from "@/components/accounts/accounts-panel";
import { LoansPanel } from "@/components/loans/loans-panel";
import { IncomePanel } from "@/components/income/income-panel";
import { RecurringRulesPanel } from "@/components/recurring/recurring-rules-panel";

export function SettingsTab() {
  return (
    <div className="flex flex-col gap-4">
      <BudgetInput />
      <ApiTokenCard />
      <IntegrationInfo />
      <PushToggle />
      <AudioToggle />
      <Section title="חשבונות">
        <AccountsPanel />
      </Section>
      <Section title="הוצאות וחיובים קבועים">
        <RecurringRulesPanel />
      </Section>
      <Section title="הלוואות">
        <LoansPanel />
      </Section>
      <Section title="הכנסות">
        <IncomePanel />
      </Section>
      <StatementImport />
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-surface/50 p-5 backdrop-blur-md">
      <header className="mb-4">
        <div className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          {title}
        </div>
      </header>
      {children}
    </section>
  );
}
