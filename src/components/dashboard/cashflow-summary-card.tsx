"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertOctagon,
  ArrowDownToLine,
  Banknote,
  ChevronLeft,
  CreditCard,
  Receipt,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import {
  buildFinancialSnapshot,
  type FinancialSnapshot,
  type RiskLevel,
} from "@/lib/financial-snapshot";
import { TransactionsDrilldown } from "@/components/dashboard/transactions-drilldown";
import { tap } from "@/lib/haptics";

// One Intl formatter, plain — never `signDisplay`, which crashes iOS < 15.4
// on module load.
const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
function signedILS(value: number): string {
  if (value === 0) return ILS.format(0);
  const sign = value > 0 ? "+" : "−";
  return `${sign}${ILS.format(Math.abs(value))}`;
}

const TONE: Record<RiskLevel, { accent: string; label: string; icon: typeof ShieldCheck }> = {
  safe: { accent: "#34D399", label: "מצב יציב", icon: ShieldCheck },
  watch: { accent: "#F5C451", label: "כדאי לעקוב", icon: Sparkles },
  tight: { accent: "#F5C451", label: "חודש צפוף", icon: AlertOctagon },
  overdraft: { accent: "#F87171", label: "צפי לחריגה", icon: AlertOctagon },
};

type DrilldownState =
  | { kind: "closed" }
  | {
      kind: "open";
      title: string;
      subtitle?: string;
      filter: "actual-this-month" | "budgeted-this-month" | "all-this-month";
    };

export function CashflowSummaryCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const [drilldown, setDrilldown] = useState<DrilldownState>({ kind: "closed" });
  const openDrilldown = (
    title: string,
    filter: "actual-this-month" | "budgeted-this-month" | "all-this-month",
    subtitle?: string,
  ) => {
    tap();
    setDrilldown({ kind: "open", title, subtitle, filter });
  };
  const statuses = useFinanceStore((s) => s.statuses);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  const snapshot = useMemo<FinancialSnapshot | null>(() => {
    if (!hydrated) return null;
    return buildFinancialSnapshot({
      accounts,
      loans,
      incomes,
      entries,
      rules,
      statuses,
      monthlyBudget,
      monthKey: currentMonthKey(),
    });
  }, [
    hydrated,
    accounts,
    loans,
    incomes,
    entries,
    rules,
    statuses,
    monthlyBudget,
  ]);

  if (!hydrated || !snapshot) return null;

  // Suppress the card entirely when the user has no anchor + no budget +
  // no obligations — there's literally nothing to project.
  const hasBank = accounts.some(
    (a) => a.kind === "bank" && a.active && a.anchorBalance !== undefined,
  );
  const hasObligations =
    snapshot.fixedExpensesUntilNextMonth +
      snapshot.installmentPaymentsUntilNextMonth +
      snapshot.activeLoansPaymentsUntilNextMonth +
      snapshot.recurringCommitmentsUntilNextMonth >
    0;
  const meaningful =
    hasBank || monthlyBudget > 0 || hasObligations;
  if (!meaningful) return null;

  const tone = TONE[snapshot.riskLevel];
  const ToneIcon = tone.icon;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05, duration: 0.4 }}
      className="glass-card flex flex-col gap-4 rounded-3xl p-5"
      style={{
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 24px 60px -40px ${tone.accent}55`,
      }}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
            צפי ליום 1 בחודש הבא
          </span>
          <span
            dir="ltr"
            data-mono="true"
            className="text-3xl font-light leading-tight tracking-tight"
            style={{ color: tone.accent }}
          >
            {signedILS(snapshot.projectedBalanceOnFirstOfNextMonth)}
          </span>
          <span
            className="flex items-center gap-1.5 text-[11px]"
            style={{ color: tone.accent }}
          >
            <ToneIcon className="h-3 w-3" strokeWidth={2} />
            {tone.label}
          </span>
        </div>
        {snapshot.expectedOverdraft > 0 ? (
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#F87171]">
              חריגה צפויה
            </span>
            <span
              dir="ltr"
              data-mono="true"
              className="text-xl font-semibold text-[#F87171]"
            >
              −{ILS.format(snapshot.expectedOverdraft)}
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              עוד נותר לבזבז
            </span>
            <span
              dir="ltr"
              data-mono="true"
              className="text-xl font-semibold text-foreground"
            >
              {ILS.format(snapshot.safeToSpendUntilMonthEnd)}
            </span>
            <span className="text-[10px] text-muted-foreground">
              ~{ILS.format(snapshot.dailySafeToSpend)} ביום
            </span>
          </div>
        )}
      </header>

      {snapshot.expectedOverdraft > 0 ? (
        <p className="rounded-2xl border border-[#F87171]/30 bg-[#F87171]/10 px-3 py-2 text-[11px] leading-relaxed text-[#F87171]">
          התקציב שהוגדר ({ILS.format(snapshot.monthlyBudget)}) גבוה מהיתרה
          הצפויה אחרי התחייבויות. אם תוציא את כל התקציב, צפוי מינוס של{" "}
          {ILS.format(snapshot.expectedOverdraft)} ב־1 לחודש הבא.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Row
          icon={<Wallet className="h-3.5 w-3.5" />}
          label="יתרה נוכחית"
          value={signedILS(snapshot.currentBalance)}
          tone={snapshot.currentBalance < 0 ? "negative" : "neutral"}
        />
        <Row
          icon={<ArrowDownToLine className="h-3.5 w-3.5" />}
          label="הכנסות עד 1 לחודש"
          value={`+${ILS.format(snapshot.expectedIncomeUntilNextMonth)}`}
          tone="positive"
        />
        <Row
          icon={<Receipt className="h-3.5 w-3.5" />}
          label="הוצאות קבועות"
          value={`−${ILS.format(snapshot.fixedExpensesUntilNextMonth)}`}
          tone="negative"
        />
        <Row
          icon={<CreditCard className="h-3.5 w-3.5" />}
          label="תשלומים"
          value={`−${ILS.format(snapshot.installmentPaymentsUntilNextMonth)}`}
          tone="negative"
        />
        <Row
          icon={<Banknote className="h-3.5 w-3.5" />}
          label="הלוואות"
          value={`−${ILS.format(snapshot.activeLoansPaymentsUntilNextMonth)}`}
          tone="negative"
        />
        <Row
          icon={<CreditCard className="h-3.5 w-3.5" />}
          label="חיובי כרטיס עתידיים"
          value={`−${ILS.format(snapshot.recurringCommitmentsUntilNextMonth)}`}
          tone="negative"
        />
      </div>

      {snapshot.monthlyBudget > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          <Row
            icon={<Sparkles className="h-3.5 w-3.5" />}
            label="תקציב שהוגדר"
            value={ILS.format(snapshot.monthlyBudget)}
            tone="neutral"
          />
          <Row
            icon={<Receipt className="h-3.5 w-3.5" />}
            label="כבר ניצלת"
            value={`−${ILS.format(snapshot.actualSpentThisMonth)}`}
            tone="negative"
            onClick={() =>
              openDrilldown(
                "בפועל החודש",
                "actual-this-month",
                "כל החיובים שנכנסו עד עכשיו",
              )
            }
          />
          <Row
            icon={<Sparkles className="h-3.5 w-3.5" />}
            label="נותר מהתקציב"
            value={ILS.format(snapshot.remainingBudgetThisMonth)}
            tone={
              snapshot.remainingBudgetThisMonth === 0 ? "negative" : "positive"
            }
          />
          <Row
            icon={<ShieldCheck className="h-3.5 w-3.5" />}
            label="כמה עוד צפוי לצאת"
            value={`−${ILS.format(snapshot.remainingPlannedSpending)}`}
            tone="negative"
            onClick={() =>
              openDrilldown(
                "השפעת תקציב",
                "budgeted-this-month",
                "חיובים שנספרים מול התקציב",
              )
            }
          />
        </div>
      ) : null}

      <TransactionsDrilldown
        open={drilldown.kind === "open"}
        onOpenChange={(o) => {
          if (!o) setDrilldown({ kind: "closed" });
        }}
        title={drilldown.kind === "open" ? drilldown.title : ""}
        subtitle={drilldown.kind === "open" ? drilldown.subtitle : undefined}
        filter={
          drilldown.kind === "open" ? drilldown.filter : "actual-this-month"
        }
      />
    </motion.section>
  );
}

function Row({
  icon,
  label,
  value,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral";
  onClick?: () => void;
}) {
  const color =
    tone === "positive"
      ? "#34D399"
      : tone === "negative"
        ? "#F87171"
        : "#E4E7EC";
  const interactive = Boolean(onClick);
  const baseClass =
    "flex w-full items-center justify-between gap-2 rounded-xl border border-white/5 bg-black/25 px-3 py-2 text-start transition-colors";
  const inner = (
    <>
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        {label}
        {interactive ? (
          <ChevronLeft className="size-3 text-muted-foreground/60" />
        ) : null}
      </span>
      <span
        data-mono="true"
        dir="ltr"
        className="text-[12px] font-medium"
        style={{ color }}
      >
        {value}
      </span>
    </>
  );
  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${baseClass} hover:border-white/15 active:scale-[0.99]`}
      >
        {inner}
      </button>
    );
  }
  return <div className={baseClass}>{inner}</div>;
}
