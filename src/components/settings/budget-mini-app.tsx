"use client";

// Settings · Budget Control mini-app.
//
// UI-only rebuild. Same store surface (setMonthlyBudget /
// setBudgetMode / setBudgetSafetyBuffer) and same source of
// truth (buildDailyBudgetView) so Home / Time / Insights /
// forecast all react without engine changes.
//
// Layout:
//   • Compact hero card — budget amount, "נותר היום",
//     "צפוי לסוף חודש", status pill.
//   • Segmented toggle: אוטומטי · ידני (with layoutId pill).
//   • Two expandable rows — tap to reveal slider:
//       - תקרת תקציב (manual only)
//       - כרית ביטחון
//   • Smart inline alert only when state is tight/deficit.
//   • Right-aligned "שמור שינויים" pill.

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Target, Wallet, AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useFinanceStore } from "@/lib/store";
import { buildDailyBudgetView } from "@/lib/daily-budget-view";
import { success as hapticSuccess, tap as hapticTap } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const EASE = [0.32, 0.72, 0, 1] as const;

type Mode = "auto" | "manual";
type Panel = "cap" | "buffer" | null;

const STATUS = {
  calm: { label: "תקין", tone: "safe" },
  tight: { label: "לשים לב", tone: "watch" },
  deficit: { label: "חריגה", tone: "danger" },
} as const;

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

  const [draftMode, setDraftMode] = useState<Mode>(storedMode);
  const [draftBudget, setDraftBudget] = useState<number>(storedBudget);
  const [draftBufferPct, setDraftBufferPct] = useState<number>(
    Math.round(storedBuffer * 100),
  );
  const [panel, setPanel] = useState<Panel>(null);
  const reduced = useReducedMotion();

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

  const monthlyFreeBalance =
    view.currentBankBalance + view.expectedIncome - view.totalCommitments;
  const simulatedCap =
    draftMode === "auto"
      ? Math.max(
          0,
          Math.floor(
            monthlyFreeBalance *
              Math.max(0, Math.min(0.95, 1 - draftBufferPct / 100)),
          ),
        )
      : draftBudget;
  const simulatedPerDay =
    view.anchorOffset > 0 ? Math.floor(simulatedCap / view.anchorOffset) : 0;

  const dirty =
    draftMode !== storedMode ||
    (draftMode === "manual" && draftBudget !== storedBudget) ||
    draftBufferPct / 100 !== storedBuffer;

  function handleSave() {
    hapticTap();
    setBudgetMode(draftMode);
    if (draftMode === "manual") setMonthlyBudget(draftBudget);
    else setMonthlyBudget(0);
    setBudgetSafetyBuffer(draftBufferPct / 100);
    hapticSuccess();
    toast.success("התקציב נשמר");
  }

  const status = STATUS[view.state];
  const showAlert = view.state === "deficit" || view.state === "tight";

  function togglePanel(next: Panel) {
    hapticTap();
    setPanel((prev) => (prev === next ? null : next));
  }

  function selectMode(next: Mode) {
    if (next === draftMode) return;
    hapticTap();
    setDraftMode(next);
    // Collapse the manual-only panel if switching to auto.
    if (next === "auto" && panel === "cap") setPanel(null);
  }

  return (
    <div className="bc-mini" dir="rtl">
      {/* Hero */}
      <div className="bc-hero" data-tone={status.tone} role="group">
        <div className="bc-hero-row">
          <span className="bc-hero-eyebrow">תקציב חודשי</span>
          <span className={`bc-hero-status bc-tone-${status.tone}`}>
            {status.label}
          </span>
        </div>
        <span className="bc-hero-amount" data-mono="true" dir="ltr">
          {ILS.format(simulatedCap)}
        </span>
        <div className="bc-hero-stats">
          <div className="bc-hero-stat">
            <span className="bc-hero-stat-label">נותר היום</span>
            <span className="bc-hero-stat-value" data-mono="true" dir="ltr">
              {ILS.format(simulatedPerDay)}
            </span>
          </div>
          <div className="bc-hero-stat">
            <span className="bc-hero-stat-label">צפוי לסוף חודש</span>
            <span className="bc-hero-stat-value" data-mono="true" dir="ltr">
              {ILS.format(view.forecastBankAtAnchor)}
            </span>
          </div>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="bc-modes" role="tablist" aria-label="מצב תקציב">
        <ModeButton
          active={draftMode === "auto"}
          onClick={() => selectMode("auto")}
          icon={<Target className="size-3.5" />}
          label="אוטומטי"
        />
        <ModeButton
          active={draftMode === "manual"}
          onClick={() => selectMode("manual")}
          icon={<Wallet className="size-3.5" />}
          label="ידני"
        />
      </div>
      <p className="bc-mode-hint">
        {draftMode === "auto"
          ? "Pulse מחשב לפי יתרה, הכנסות והתחייבויות."
          : "אני קובע סכום מקסימום לחודש."}
      </p>

      {/* Expandable rows */}
      <div className="bc-rows">
        {draftMode === "manual" ? (
          <ExpandableRow
            label="תקרת תקציב"
            value={ILS.format(draftBudget)}
            open={panel === "cap"}
            onToggle={() => togglePanel("cap")}
            reduced={reduced ?? false}
          >
            <input
              type="range"
              min={0}
              max={30000}
              step={50}
              value={draftBudget}
              onChange={(e) => setDraftBudget(Number(e.target.value))}
              className="bc-slider"
              aria-label="תקרת תקציב חודשית"
            />
            <p className="bc-hint">
              ~ {ILS.format(simulatedPerDay)} ליום · אם תעבור, Pulse יסמן.
            </p>
          </ExpandableRow>
        ) : null}

        <ExpandableRow
          label="כרית ביטחון"
          value={`${draftBufferPct}%`}
          open={panel === "buffer"}
          onToggle={() => togglePanel("buffer")}
          reduced={reduced ?? false}
        >
          <input
            type="range"
            min={0}
            max={40}
            step={1}
            value={draftBufferPct}
            onChange={(e) => setDraftBufferPct(Number(e.target.value))}
            className="bc-slider"
            aria-label="כרית ביטחון באחוזים"
          />
          <p className="bc-hint">
            שומר על אחוז מהיתרה בצד לסוף חודש. תקציב מדומה:{" "}
            <span data-mono="true" dir="ltr">
              {ILS.format(simulatedCap)}
            </span>
          </p>
        </ExpandableRow>
      </div>

      {/* Smart alert (only when tight/deficit) */}
      <AnimatePresence>
        {showAlert ? (
          <motion.div
            key="bc-alert"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: reduced ? 0.12 : 0.28, ease: EASE }}
            className="bc-alert"
            data-tone={view.state === "deficit" ? "danger" : "watch"}
            role="status"
          >
            <span aria-hidden className="bc-alert-icon">
              <AlertTriangle className="size-3.5" />
            </span>
            <span className="bc-alert-text">
              {view.state === "deficit"
                ? `חריגה של ${ILS.format(view.deficit)} מהיתרה הצפויה.`
                : `היום הוצאת ${ILS.format(view.spentToday)} מתוך ${ILS.format(view.perDay)}.`}
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Save */}
      <div className="bc-save-row">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty}
          className="bc-save"
          aria-label="שמור שינויים"
        >
          שמור שינויים
        </button>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="bc-mode"
      data-active={active}
    >
      {active ? (
        <motion.span
          layoutId="bc-mode-pill"
          className="bc-mode-pill"
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
        />
      ) : null}
      <span className="bc-mode-content">
        <span aria-hidden className="bc-mode-icon">
          {icon}
        </span>
        <span className="bc-mode-label">{label}</span>
      </span>
    </button>
  );
}

function ExpandableRow({
  label,
  value,
  open,
  onToggle,
  reduced,
  children,
}: {
  label: string;
  value: string;
  open: boolean;
  onToggle: () => void;
  reduced: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bc-row" data-open={open}>
      <button
        type="button"
        className="bc-row-head"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="bc-row-label">{label}</span>
        <span className="bc-row-right">
          <span className="bc-row-value" data-mono="true" dir="ltr">
            {value}
          </span>
          <motion.span
            aria-hidden
            className="bc-row-chev"
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: reduced ? 0.12 : 0.24, ease: EASE }}
          >
            <ChevronDown className="size-3.5" />
          </motion.span>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduced ? 0.12 : 0.32, ease: EASE }}
            className="bc-row-body-wrap"
          >
            <div className="bc-row-body">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
