"use client";

// Phase 225 — Simple-mode hero card #3: "מה הסיבה המרכזית".
//
// One insight — the most important thing the user should know right
// now. Pulls from existing engines, never invents new signals:
//   1. Liquidity dip in the window (crossesNegative) → top priority.
//   2. Top-severity RiskWarning otherwise.
//   3. Fallback "מצב יציב" message when nothing flagged.
//
// Single sentence + tone color. The user can drill into "ניתוחים
// וסטטיסטיקות" for the full breakdown.

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { buildRiskWarnings } from "@/lib/risk-warnings";
import { liquidityCurve } from "@/lib/liquidity-curve";
import { monthKeyOf } from "@/lib/dates";

export function HeroInsightCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const entries = useFinanceStore((s) => s.entries);
  const statuses = useFinanceStore((s) => s.statuses);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  const insight = useMemo(() => {
    if (!hydrated) return null;
    const curve = liquidityCurve({
      accounts,
      loans,
      incomes,
      rules,
      statuses,
      entries,
    });
    if (curve.crossesNegative) {
      const dipDay = curve.lowestPoint.dayIndex;
      const dipBalance = Math.round(curve.lowestPoint.balance);
      return {
        kind: "danger" as const,
        title:
          dipDay === 0
            ? "תזרים שלילי צפוי כבר היום"
            : `תזרים שלילי צפוי בעוד ${dipDay} ימים`,
        detail: `נקודה נמוכה: ₪${dipBalance.toLocaleString("he-IL")}. הקפא חיוב גדול או הזרם כסף לחשבון.`,
      };
    }

    const warnings = buildRiskWarnings({
      accounts,
      loans,
      incomes,
      rules,
      entries,
      statuses,
      monthlyBudget,
      monthKey: monthKeyOf(new Date()),
    });
    if (warnings.length > 0) {
      const top = warnings[0];
      const tone: "warn" | "danger" =
        top.severity === "alert" ? "danger" : "warn";
      return {
        kind: tone,
        title: top.title,
        detail: top.detail,
      };
    }

    return {
      kind: "ok" as const,
      title: "הכל תחת שליטה",
      detail: "אין סיכונים תזרימיים בולטים לחודש הקרוב.",
    };
  }, [
    hydrated,
    accounts,
    loans,
    incomes,
    rules,
    statuses,
    entries,
    monthlyBudget,
  ]);

  if (!hydrated || !insight) return <Skeleton />;

  const color =
    insight.kind === "danger"
      ? "#F87171"
      : insight.kind === "warn"
        ? "#F59E0B"
        : "#34D399";
  const Icon =
    insight.kind === "ok"
      ? CheckCircle2
      : insight.kind === "warn"
        ? Info
        : AlertTriangle;

  return (
    <section
      className="glass-card flex items-start gap-4 rounded-3xl p-6"
      style={{
        background: `linear-gradient(135deg, ${color}14 0%, transparent 60%)`,
      }}
      aria-label="התובנה הכי חשובה"
    >
      <span
        className="flex size-12 shrink-0 items-center justify-center rounded-2xl"
        style={{ background: `${color}22`, color }}
      >
        <Icon className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-micro text-muted-foreground">
          התובנה הכי חשובה
        </span>
        <span className="text-section" style={{ color }}>
          {insight.title}
        </span>
        <span className="text-body text-muted-foreground/90">
          {insight.detail}
        </span>
      </div>
    </section>
  );
}

function Skeleton() {
  return (
    <section className="glass-card flex flex-col gap-3 rounded-3xl p-6">
      <span className="text-micro text-muted-foreground">
        התובנה הכי חשובה
      </span>
      <span className="h-6 w-3/4 animate-pulse rounded bg-white/5" />
    </section>
  );
}
