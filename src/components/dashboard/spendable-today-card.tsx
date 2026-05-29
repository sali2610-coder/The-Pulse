"use client";

// Phase 210 — "כמה נשאר לי לבזבז".
//
// Prominent card backed by the auto-budget engine. Surfaces:
//
//   * single big number = spendableUntilCycleEnd
//   * daily allowance = spendable / daysRemaining
//   * vibe-tinted danger warning when projection crosses zero
//   * compact per-card / per-loan breakdown
//   * "עדכן יתרת בנק אחרי משכורת" CTA that scrolls to Settings →
//     accounts + emits a deep link, so the user can fix balance
//     anytime without hunting through menus.
//
// Auto-hides when no bank anchors exist (without a starting balance
// the engine has no anchor to project from).

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarClock,
  CreditCard,
  Landmark,
  Sparkles,
  Wallet,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { autoBudget, type AutoBudgetVibe } from "@/lib/auto-budget";
import { buildCashFlowBuckets } from "@/lib/cash-flow-bucket";
import {
  BudgetBreakdownPanel,
  BudgetNegativeBanner,
} from "@/components/budget/budget-breakdown";
import { SectionHeader } from "@/components/ui/section-header";
import {
  InsightChip,
  type InsightSeverity,
} from "@/components/ui/insight-chip";
import { CardEmpty } from "@/components/ui/card-empty";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { InlineSalaryUpdateSheet } from "@/components/dashboard/inline-salary-update-sheet";
import { useLiquidityAlert } from "@/lib/use-liquidity-alert";
import { tap } from "@/lib/haptics";
import { SPRING_SOFT } from "@/lib/motion-tokens";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "long",
});

const VIBE_TONE: Record<AutoBudgetVibe, string> = {
  calm: "#34D399",
  tight: "#D4AF37",
  danger: "#F87171",
};

const VIBE_LABEL: Record<AutoBudgetVibe, string> = {
  calm: "מצב רגוע",
  tight: "מרווח קצר",
  danger: "תזרים שלילי",
};

const VIBE_SEV: Record<AutoBudgetVibe, InsightSeverity> = {
  calm: "info",
  tight: "watch",
  danger: "warn",
};

export function SpendableTodayCard() {
  const [salarySheetOpen, setSalarySheetOpen] = useState(false);
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const safetyBuffer = useFinanceStore((s) => s.budgetSafetyBuffer);
  const budgetMode = useFinanceStore((s) => s.budgetMode);

  const report = useMemo(() => {
    if (!hydrated) return null;
    return autoBudget({
      accounts,
      loans,
      incomes,
      entries,
      rules,
      statuses,
      safetyBuffer,
    });
  }, [hydrated, accounts, loans, incomes, entries, rules, statuses, safetyBuffer]);

  const buckets = useMemo(() => {
    if (!hydrated) return null;
    return buildCashFlowBuckets({
      accounts,
      loans,
      rules,
      statuses,
      entries,
    });
  }, [hydrated, accounts, loans, rules, statuses, entries]);

  // Phase 212 — proactive push when the engine flags a dip into
  // the red. Hook handles its own once-per-day dedup; the server
  // route dedups again per scope so multiple devices can't fan out.
  useLiquidityAlert({
    willCrossZero: report?.willCrossZero ?? false,
    daysUntilDip: report?.daysRemaining ?? 0,
    lowestBalance: report?.lowestProjectedBalance ?? 0,
    lowestAtISO: report?.cycleEndAt ?? null,
  });

  if (!hydrated || !report) return null;

  const hasAnchors = accounts.some(
    (a) => a.active && a.kind === "bank" && typeof a.anchorBalance === "number",
  );

  if (!hasAnchors) {
    return (
      <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
        <SectionHeader icon={<Wallet />} title="כמה נשאר לי לבזבז" />
        <CardEmpty
          icon={<Banknote className="size-4" />}
          title="חסרה יתרת בנק כעוגן"
          reason="אי אפשר לחשב סכום בטוח לבזבוז בלי יתרת בנק נוכחית."
          unlockHint="הגדרות → חשבונות → הוסף חשבון בנק עם יתרה נוכחית."
        />
      </section>
    );
  }

  const tone = VIBE_TONE[report.vibe];
  const isAuto = budgetMode === "auto";

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_SOFT}
      className="glass-card relative overflow-hidden rounded-3xl p-4"
    >
      {/* Soft tint gradient — pulls eye to the headline number. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-3xl"
        style={{
          background: `radial-gradient(circle at 20% -10%, ${tone}22 0%, transparent 60%)`,
        }}
      />

      <SectionHeader
        icon={<Wallet />}
        title="כמה נשאר לי לבזבז"
        trailing={
          <div className="flex items-center gap-1">
            {isAuto ? (
              <InsightChip
                severity="info"
                icon={<Sparkles className="size-2.5" />}
                label="אוטומטי"
              />
            ) : null}
            <InsightChip
              severity={VIBE_SEV[report.vibe]}
              icon={
                report.vibe === "danger" ? (
                  <AlertTriangle className="size-2.5" />
                ) : undefined
              }
              label={VIBE_LABEL[report.vibe]}
            />
          </div>
        }
      />

      {/* Phase 323 — headline reads RAW availableUntilCycleEnd so a
         negative trajectory shows the real number (with sign) instead
         of a misleading clamped "₪0". Color flips red below zero. */}
      <div className="flex items-baseline justify-between gap-3">
        <span
          data-mono="true"
          dir="ltr"
          className="text-[40px] font-light leading-none"
          style={{
            color: report.availableUntilCycleEnd < 0 ? "#F87171" : tone,
          }}
        >
          <AnimatedCounter
            value={Math.abs(report.availableUntilCycleEnd)}
            format={(v) =>
              `${report.availableUntilCycleEnd < 0 ? "−" : ""}${ILS.format(v)}`
            }
          />
        </span>
        <div className="flex flex-col items-end gap-0.5 leading-tight text-[10.5px] text-muted-foreground/85">
          <span>
            עד {DAY_FMT.format(new Date(report.cycleEndAt))}
          </span>
          <span dir="ltr">{report.daysRemaining} ימים</span>
        </div>
      </div>

      {report.availableUntilCycleEnd < 0 ? (
        <BudgetNegativeBanner available={report.availableUntilCycleEnd} />
      ) : null}

      {/* Phase 323 — shared 6-line breakdown so the headline is
         auditable in place. Same engine as the Settings panel. */}
      <BudgetBreakdownPanel
        breakdown={report.breakdown}
        trusted={report.breakdown.hasAnchors}
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span>
          מותר ליום ·{" "}
          <span data-mono="true" dir="ltr" className="text-foreground">
            {ILS.format(report.dailyAllowance)}
          </span>
        </span>
        <span>
          נקודה נמוכה ·{" "}
          <span
            data-mono="true"
            dir="ltr"
            style={{
              color: report.lowestProjectedBalance < 0 ? "#F87171" : undefined,
            }}
          >
            {report.lowestProjectedBalance >= 0 ? "+" : ""}
            {ILS.format(report.lowestProjectedBalance)}
          </span>
        </span>
        {report.safetyBufferApplied > 0 ? (
          <span>
            כרית ·{" "}
            <span data-mono="true" dir="ltr">
              {ILS.format(report.safetyBufferApplied)}
            </span>
          </span>
        ) : null}
      </div>

      {report.willCrossZero ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          תזרים צפוי לרדת מתחת ל-0 לפני המשכורת הבאה. שקול לדחות
          חיוב גדול או לבדוק חשבון.
        </p>
      ) : null}

      {/* Per-card / per-loan breakdown — read directly so the user
         can see WHO will hit them and WHEN, never as one fused total. */}
      {buckets && buckets.buckets.length > 0 ? (
        <ul className="flex flex-col gap-1 border-t border-white/8 pt-2">
          {buckets.buckets.slice(0, 5).map((b) => {
            const icon =
              b.source === "card"
                ? <CreditCard className="size-3" />
                : b.source === "loan"
                  ? <CalendarClock className="size-3" />
                  : <Landmark className="size-3" />;
            return (
              <li
                key={b.id}
                className="flex items-center justify-between gap-2 py-0.5 text-[11px]"
              >
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="text-[color:var(--neon)]/85">{icon}</span>
                  {b.label}
                  {b.cardLast4 ? (
                    <span
                      className="rounded-md bg-white/8 px-1 py-0.5 text-[9px]"
                      dir="ltr"
                    >
                      ····{b.cardLast4}
                    </span>
                  ) : null}
                </span>
                <span
                  data-mono="true"
                  dir="ltr"
                  className="text-destructive"
                >
                  −{ILS.format(b.monthlyTotal)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      <button
        type="button"
        onClick={() => {
          tap();
          setSalarySheetOpen(true);
        }}
        className="mt-1 flex items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-[11px] text-muted-foreground transition-colors hover:border-[color:var(--neon)]/40 hover:text-foreground"
        aria-label="עדכן יתרת בנק"
      >
        <Banknote className="size-3" />
        עדכן יתרת בנק אחרי משכורת
        <ArrowRight className="size-3" />
      </button>

      <p className="text-[10px] text-muted-foreground/80">
        החישוב בודק עד היום שלפני המשכורת הבאה ולוקח בחשבון משכורות,
        הלוואות, הוצאות קבועות, וכל חיוב כרטיס שיגיע ביום הסליקה של הכרטיס.
      </p>

      <InlineSalaryUpdateSheet
        open={salarySheetOpen}
        onOpenChange={setSalarySheetOpen}
      />
    </motion.section>
  );
}
