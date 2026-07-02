"use client";

// Home v2 · Local preview route.
//
// Auth-free entry that renders HomeCanvas with a lightweight demo
// state seeded into the existing store on first visit. No auth
// changes, no engine changes, no data-model changes. When the store
// already carries user data the seed is skipped so this route never
// overwrites real state.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { HomeCanvas } from "@/components/home/home-canvas";
import { useHomeData } from "@/components/home/use-home-data";
import { VariantConcierge } from "@/components/home/variants/variant-concierge";
import { VariantPortfolio } from "@/components/home/variants/variant-portfolio";
import { VariantPortfolioPro } from "@/components/home/variants/variant-portfolio-pro";
import { VariantVault } from "@/components/home/variants/variant-vault";
import { SnapshotProvider } from "@/lib/snapshot-context";
import { useFinanceStore } from "@/lib/store";
import { SCENARIOS } from "@/lib/mock-data";

type Variant = "base" | "vault" | "concierge" | "portfolio" | "pro";

const VARIANTS: Array<{ key: Variant; label: string }> = [
  { key: "pro", label: "Portfolio Pro" },
  { key: "portfolio", label: "Portfolio" },
  { key: "vault", label: "Vault" },
  { key: "concierge", label: "Concierge" },
  { key: "base", label: "Base v2" },
];

function useStoreTick(): number {
  return useSyncExternalStore(
    (cb) => useFinanceStore.subscribe(cb),
    () => {
      const s = useFinanceStore.getState();
      return (
        s.entries.length +
        s.rules.length +
        s.accounts.length +
        s.loans.length +
        s.incomes.length +
        (s.hasHydrated ? 1 : 0)
      );
    },
    () => 0,
  );
}

export default function HomeV2PreviewPage() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const tick = useStoreTick();
  const seededRef = useRef(false);

  const scenario = useMemo(() => SCENARIOS["balanced"], []);

  useEffect(() => {
    if (!hydrated || seededRef.current) return;
    const s = useFinanceStore.getState();
    const hasData =
      s.entries.length > 0 ||
      s.rules.length > 0 ||
      s.accounts.length > 0 ||
      s.loans.length > 0 ||
      s.incomes.length > 0;
    if (hasData) {
      seededRef.current = true;
      return;
    }
    // Seed: 2 banks, 2 cards, 3 loans, 2 incomes, budget, mock rules
    // + mock expenses from the balanced scenario. All values feed the
    // same engine every other screen reads.
    s.setMonthlyBudget(scenario.monthlyBudget);

    const bank1 = s.addAccount({
      kind: "bank",
      label: "בנק ראשי",
      anchorBalance: 9382,
    });
    s.setAnchor(bank1.id, 9382);

    const bank2 = s.addAccount({
      kind: "bank",
      label: "בנק משני",
      anchorBalance: 2410,
    });
    s.setAnchor(bank2.id, 2410);

    s.addAccount({
      kind: "card",
      label: "ויזה זהב",
      issuer: "cal",
      cardLast4: "7093",
      billingDay: 25,
      paymentDay: 2,
      creditLimit: 30000,
    });
    s.addAccount({
      kind: "card",
      label: "מאסטרקארד",
      issuer: "max",
      cardLast4: "2613",
      billingDay: 15,
      paymentDay: 22,
      creditLimit: 20000,
    });

    s.addLoan({
      label: "הלוואת רכב",
      monthlyInstallment: 870,
      dayOfMonth: 5,
      totalPayments: 48,
      startMonth: 6,
      startYear: 2024,
    });
    s.addLoan({
      label: "משכנתא",
      monthlyInstallment: 4200,
      dayOfMonth: 10,
      totalPayments: 240,
      startMonth: 3,
      startYear: 2022,
    });
    s.addLoan({
      label: "הלוואת לימודים",
      monthlyInstallment: 2700,
      dayOfMonth: 27,
      totalPayments: 36,
      startMonth: 9,
      startYear: 2024,
    });

    s.addIncome({
      label: "משכורת · אורון",
      amount: 18000,
      dayOfMonth: 3,
    });
    s.addIncome({
      label: "משכורת · משנה",
      amount: 6500,
      dayOfMonth: 5,
    });

    for (const rule of scenario.rules) s.addRule(rule);
    for (const exp of scenario.expenses) s.addExpense(exp);

    seededRef.current = true;
  }, [hydrated, scenario]);

  const reset = () => {
    const s = useFinanceStore.getState();
    s.clearAll();
    seededRef.current = false;
  };

  const hasStoreData =
    useFinanceStore.getState().entries.length > 0 ||
    useFinanceStore.getState().accounts.length > 0 ||
    useFinanceStore.getState().loans.length > 0;

  if (!hydrated || !hasStoreData) {
    return (
      <main className="sally-preview-loading">
        <span>מטעין תצוגה מקדימה…</span>
      </main>
    );
  }

  void tick;

  return (
    <SnapshotProvider>
      <main className="sally-preview-shell">
        <PreviewSwitcher onReset={reset} />
      </main>
    </SnapshotProvider>
  );
}

function PreviewSwitcher({ onReset }: { onReset: () => void }) {
  const [variant, setVariant] = useState<Variant>("pro");
  const data = useHomeData();
  return (
    <>
      <header className="sally-preview-bar" dir="rtl">
        <span className="sally-preview-eyebrow">HOME V2 · תצוגה מקומית</span>
        <div className="sally-variant-tabs" role="tablist" aria-label="Home variants">
          {VARIANTS.map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={variant === v.key}
              onClick={() => setVariant(v.key)}
              className="sally-variant-tab"
              data-aurora-active={variant === v.key ? "true" : "false"}
            >
              {v.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={onReset} className="sally-preview-reset">
          נקה
        </button>
      </header>
      {variant === "base" ? (
        <HomeCanvas />
      ) : variant === "vault" ? (
        <VariantVault data={data} />
      ) : variant === "concierge" ? (
        <VariantConcierge data={data} />
      ) : variant === "portfolio" ? (
        <VariantPortfolio data={data} />
      ) : (
        <VariantPortfolioPro data={data} />
      )}
    </>
  );
}
