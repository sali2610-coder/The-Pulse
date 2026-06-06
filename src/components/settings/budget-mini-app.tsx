"use client";

// Phase 415 — Budget Control mini-dashboard.
//
// Not a form. Live sliders + KPI cards + simulated outcome. User
// drags the budget cap or safety buffer and every number recomputes
// in real time so the trade-off is visible BEFORE save.

import { useMemo, useState } from "react";
import { Sliders, Target, Wallet } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { buildDailyBudgetView } from "@/lib/daily-budget-view";
import {
  MiniAppHero,
  MiniAppStatusHero,
  type MiniAppKpi,
} from "@/components/ui/mini-app-shell";
import { toast } from "sonner";
import { success as hapticSuccess, tap as hapticTap } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const TONE = "#F87171";

export function BudgetMiniApp() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);
  const storedBudget = useFinanceStore((s) => s.monthlyBudget);
  const storedMode = useFinanceStore((s) => s.budgetMode);
  const storedBuffer = useFinanceStore((s) => s.budgetSafetyBuffer);
  const setMonthlyBudget = useFinanceStore((s) => s.setMonthlyBudget);
  const setBudgetMode = useFinanceStore((s) => s.setBudgetMode);
  const setBudgetSafetyBuffer = useFinanceStore(
    (s) => s.setBudgetSafetyBuffer,
  );

  // Local draft state — sliders edit these. "שמור" pushes to store.
  const [draftMode, setDraftMode] = useState<"manual" | "auto">(storedMode);
  const [draftBudget, setDraftBudget] = useState<number>(storedBudget);
  const [draftBuffer, setDraftBuffer] = useState<number>(
    storedBuffer * 100,
  ); // percent

  const view = useMemo(() => {
    if (!hydrated) return null;
    return buildDailyBudgetView({
      accounts,
      loans,
      incomes,
      entries,
      rules,
      statuses,
    });
  }, [hydrated, accounts, loans, incomes, entries, rules, statuses]);

  if (!hydrated || !view) return null;

  // Live simulation — what daily allowance + EOM look like at draft.
  const expectedIncomeAcc = view.expectedIncome;
  const totalCommitmentsAcc = view.totalCommitments;
  const monthlyFreeBalance =
    view.currentBankBalance + expectedIncomeAcc - totalCommitmentsAcc;
  const simulatedCap =
    draftMode === "auto"
      ? Math.max(
          0,
          Math.floor(
            monthlyFreeBalance *
              Math.max(0, Math.min(0.95, 1 - draftBuffer / 100)),
          ),
        )
      : draftBudget;
  const perDay =
    view.anchorOffset > 0 ? Math.floor(simulatedCap / view.anchorOffset) : 0;

  const dirty =
    draftMode !== storedMode ||
    (draftMode === "manual" && draftBudget !== storedBudget) ||
    draftBuffer / 100 !== storedBuffer;

  function handleSave() {
    hapticTap();
    setBudgetMode(draftMode);
    if (draftMode === "manual") setMonthlyBudget(draftBudget);
    else setMonthlyBudget(0);
    setBudgetSafetyBuffer(draftBuffer / 100);
    hapticSuccess();
    toast.success("התקציב נשמר");
  }

  const kpis: MiniAppKpi[] = [
    {
      label: "תקציב חודשי מדומה",
      value: ILS.format(simulatedCap),
      tone: TONE,
      emphasis: true,
      caption:
        draftMode === "auto" ? "חישוב אוטומטי לפי האג״ז" : "הגדרה ידנית",
    },
    {
      label: "מותר היום",
      value: ILS.format(perDay),
      tone: "#34D399",
      caption: `כל יום עד ${view.anchorOffset} ימים`,
    },
    {
      label: "פנוי לחודש",
      value: ILS.format(Math.round(monthlyFreeBalance)),
      tone: "#A78BFA",
      caption: "בנק + הכנסה צפויה − התחייבויות",
    },
  ];

  return (
    <div className="flex flex-col gap-3" dir="rtl">
      <MiniAppHero
        title="בקרת תקציב"
        subtitle="גרור את הסליידרים. הצפי לכל יום + לסוף החודש מתעדכן בלייב."
        kpis={kpis}
      />

      {/* Mode toggle */}
      <section className="flex flex-col gap-2 rounded-3xl border border-white/8 bg-white/[0.03] p-3">
        <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          מצב
        </span>
        <div className="grid grid-cols-2 gap-2">
          <ModeCard
            active={draftMode === "auto"}
            onClick={() => setDraftMode("auto")}
            icon={Target}
            title="אוטומטי"
            description="Pulse מחשב תקציב חודשי לפי היתרה והאג״ז."
          />
          <ModeCard
            active={draftMode === "manual"}
            onClick={() => setDraftMode("manual")}
            icon={Wallet}
            title="ידני"
            description="אני קובע סכום מקסימום החודש."
          />
        </div>
      </section>

      {/* Manual cap slider */}
      {draftMode === "manual" ? (
        <section className="flex flex-col gap-3 rounded-3xl border border-white/8 bg-white/[0.03] p-4">
          <header className="flex items-baseline justify-between">
            <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              תקרת תקציב חודשית
            </span>
            <span
              data-mono="true"
              dir="ltr"
              className="text-[18px] font-light text-foreground"
              style={{ color: TONE, textShadow: `0 0 18px ${TONE}55` }}
            >
              {ILS.format(draftBudget)}
            </span>
          </header>
          <input
            type="range"
            min={0}
            max={30000}
            step={50}
            value={draftBudget}
            onChange={(e) => setDraftBudget(Number(e.target.value))}
            className="w-full"
            aria-label="תקרת תקציב חודשית"
          />
          <p className="text-[11px] text-muted-foreground">
            ב-{view.anchorOffset} הימים הבאים, מותר ~ {ILS.format(perDay)} ביום.
            אם תעבור את התקרה, Pulse יסמן באדום.
          </p>
        </section>
      ) : null}

      {/* Safety buffer */}
      <section className="flex flex-col gap-3 rounded-3xl border border-white/8 bg-white/[0.03] p-4">
        <header className="flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            כרית ביטחון
          </span>
          <span
            data-mono="true"
            dir="ltr"
            className="text-[15px] font-medium text-foreground"
          >
            {draftBuffer}%
          </span>
        </header>
        <input
          type="range"
          min={0}
          max={40}
          step={1}
          value={draftBuffer}
          onChange={(e) => setDraftBuffer(Number(e.target.value))}
          className="w-full"
          aria-label="כרית ביטחון באחוזים"
        />
        <p className="text-[11px] text-muted-foreground">
          המערכת תשמור את האחוז הזה צד בכל סוף חודש כדי לא להגיע ל-₪0.
          תקציב מדומה: {ILS.format(simulatedCap)}.
        </p>
      </section>

      <MiniAppStatusHero
        tone={view.state === "deficit" ? "#F87171" : "#34D399"}
        icon={Sliders}
        title={view.state === "deficit" ? "תקציב ממש צפוף" : "מצב טוב"}
        detail={`היום הוצאת ${ILS.format(view.spentToday)} מתוך ${ILS.format(view.perDay)} מותרים. צפי לסוף החודש: ${ILS.format(view.forecastBankAtAnchor)}.`}
      />

      <button
        type="button"
        onClick={handleSave}
        disabled={!dirty}
        className="h-12 rounded-2xl text-[14.5px] font-semibold transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        style={{
          background: "linear-gradient(180deg, #F6D970 0%, #D4AF37 100%)",
          color: "#1A140A",
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.4) inset, 0 8px 22px -6px rgba(212,175,55,0.55)",
        }}
      >
        שמור שינויים
      </button>
    </div>
  );
}

function ModeCard({
  active,
  onClick,
  icon: Icon,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Target;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        hapticTap();
        onClick();
      }}
      className="flex flex-col gap-1 rounded-2xl border p-3 text-right transition-colors"
      style={{
        background: active ? `${TONE}1f` : "rgba(0,0,0,0.30)",
        borderColor: active ? `${TONE}66` : "rgba(255,255,255,0.10)",
        boxShadow: active ? `0 8px 22px -10px ${TONE}66` : undefined,
      }}
      dir="rtl"
    >
      <span
        aria-hidden
        className="inline-flex size-7 items-center justify-center rounded-xl"
        style={{
          background: active ? `${TONE}33` : "rgba(255,255,255,0.05)",
          color: active ? TONE : "rgba(255,255,255,0.65)",
        }}
      >
        <Icon className="size-4" strokeWidth={1.6} />
      </span>
      <span className="text-[13px] font-medium text-foreground">{title}</span>
      <span className="text-[11px] text-muted-foreground">{description}</span>
    </button>
  );
}
