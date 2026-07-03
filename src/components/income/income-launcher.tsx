"use client";

// Income · premium launcher for the Home "הכנסות" section.
//
// Three-part composition per the product rule:
//   1. Hero visualization   — animated progress ring, big expected
//                             number, received/expected caption.
//   2. Secondary card       — next-income chip (label + date + ₪).
//   3. Expandable details   — per-income edit list with baseline
//                             editor (opens IncomeFullScreenEdit) +
//                             one-off month overrides (setIncomeActual)
//                             for the current and next month.
//
// UI/UX only. Baseline reads/writes route to store.updateIncome,
// month overrides route to store.setIncomeActual — both preexisting
// store methods. Every downstream engine (forecast, liquidity, cash-
// flow) continues to derive its numbers from the same store — nothing
// here recomputes anything.

import { useMemo, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  CalendarClock,
  ChevronDown,
  Pencil,
  Wallet,
} from "lucide-react";

import { IncomeFullScreenEdit } from "@/components/income/income-fullscreen-edit";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useFinanceStore } from "@/lib/store";
import { addMonths, currentMonthKey } from "@/lib/dates";
import { incomeForMonth } from "@/lib/income-month";
import { tap as hapticTap, success as hapticSuccess } from "@/lib/haptics";
import type { Income } from "@/types/finance";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const DATE_FMT_LONG = new Intl.DateTimeFormat("he-IL", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

const EASE = [0.32, 0.72, 0, 1] as const;

export function IncomeLauncher() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const incomes = useFinanceStore((s) => s.incomes);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editingIncomeId, setEditingIncomeId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [overrideIncomeId, setOverrideIncomeId] = useState<string | null>(null);
  const [overrideMonthKey, setOverrideMonthKey] = useState<string>(
    currentMonthKey(),
  );
  const [overrideOpen, setOverrideOpen] = useState(false);

  const active = useMemo(
    () =>
      incomes
        .filter((i) => i.active)
        .slice()
        .sort((a, b) => a.dayOfMonth - b.dayOfMonth),
    [incomes],
  );
  const monthKey = currentMonthKey();
  const nextMonthKey = addMonths(monthKey, 1);

  const expectedThisMonth = useMemo(
    () => active.reduce((s, i) => s + incomeForMonth(i, monthKey), 0),
    [active, monthKey],
  );
  const receivedThisMonth = useMemo(() => {
    const now = new Date();
    const today = now.getDate();
    let sum = 0;
    for (const i of active) {
      if (i.dayOfMonth <= today) sum += incomeForMonth(i, monthKey);
    }
    return sum;
  }, [active, monthKey]);
  const nextIncomeInfo = useMemo(
    () => pickNextIncome(active, monthKey, nextMonthKey),
    [active, monthKey, nextMonthKey],
  );

  if (!hydrated) return <div className="ob-skeleton" aria-hidden />;
  if (active.length === 0) return <EmptyState />;

  function openBaselineEditor(id: string | null) {
    hapticTap();
    setEditingIncomeId(id);
    setEditorOpen(true);
  }

  function openOverrideEditor(id: string, mk: string) {
    hapticTap();
    setOverrideIncomeId(id);
    setOverrideMonthKey(mk);
    setOverrideOpen(true);
  }

  const ratio =
    expectedThisMonth > 0
      ? Math.max(0, Math.min(1, receivedThisMonth / expectedThisMonth))
      : 0;

  return (
    <div className="il-root" dir="rtl">
      <IncomeHero
        expected={expectedThisMonth}
        received={receivedThisMonth}
        ratio={ratio}
        activeCount={active.length}
      />

      <NextIncomeCard next={nextIncomeInfo} />

      <ExpandableDetails
        open={detailsOpen}
        onToggle={() => {
          hapticTap();
          setDetailsOpen((v) => !v);
        }}
        activeCount={active.length}
      >
        <ul className="il-edit-list">
          {active.map((inc) => {
            const currentAmt = incomeForMonth(inc, monthKey);
            const nextAmt = incomeForMonth(inc, nextMonthKey);
            const overriddenCurrent =
              inc.actualByMonth?.[monthKey] !== undefined;
            const overriddenNext =
              inc.actualByMonth?.[nextMonthKey] !== undefined;
            return (
              <li key={inc.id} className="il-edit-row">
                <div className="il-edit-head">
                  <div className="il-edit-titles">
                    <span className="il-edit-title">{inc.label}</span>
                    <span className="il-edit-meta">
                      בסיס: {ILS.format(inc.amount)} · יום {inc.dayOfMonth}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="il-edit-baseline"
                    onClick={() => openBaselineEditor(inc.id)}
                    aria-label={`ערוך משכורת ${inc.label}`}
                  >
                    <Pencil className="size-3.5" />
                    ערוך משכורת
                  </button>
                </div>
                <div className="il-edit-months">
                  <button
                    type="button"
                    className="il-edit-month"
                    onClick={() => openOverrideEditor(inc.id, monthKey)}
                    data-overridden={overriddenCurrent ? "true" : undefined}
                  >
                    <span className="il-edit-month-label">חודש נוכחי</span>
                    <span
                      className="il-edit-month-value"
                      data-mono="true"
                      dir="ltr"
                    >
                      {ILS.format(Math.round(currentAmt))}
                    </span>
                    <span className="il-edit-month-hint">
                      {overriddenCurrent
                        ? "שינוי חד-פעמי · הקש לעדכון"
                        : "עדכן לחודש הזה"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="il-edit-month"
                    onClick={() => openOverrideEditor(inc.id, nextMonthKey)}
                    data-overridden={overriddenNext ? "true" : undefined}
                  >
                    <span className="il-edit-month-label">חודש הבא</span>
                    <span
                      className="il-edit-month-value"
                      data-mono="true"
                      dir="ltr"
                    >
                      {ILS.format(Math.round(nextAmt))}
                    </span>
                    <span className="il-edit-month-hint">
                      {overriddenNext
                        ? "שינוי חד-פעמי · הקש לעדכון"
                        : "שמור שינוי חד-פעמי"}
                    </span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </ExpandableDetails>

      <IncomeFullScreenEdit
        incomeId={editingIncomeId}
        open={editorOpen}
        onOpenChange={(o) => {
          setEditorOpen(o);
          if (!o) setEditingIncomeId(null);
        }}
      />

      <OverrideSheet
        open={overrideOpen}
        onOpenChange={(o) => {
          setOverrideOpen(o);
          if (!o) setOverrideIncomeId(null);
        }}
        incomeId={overrideIncomeId}
        monthKey={overrideMonthKey}
      />
    </div>
  );
}

// ── Hero ──────────────────────────────────────────────────

function IncomeHero({
  expected,
  received,
  ratio,
  activeCount,
}: {
  expected: number;
  received: number;
  ratio: number;
  activeCount: number;
}) {
  const reduced = useReducedMotion();
  const R = 62;
  const CIRC = 2 * Math.PI * R;
  return (
    <section className="il-hero" aria-label="הכנסות החודש">
      <span aria-hidden className="il-hero-aurora" />
      <div className="il-hero-ring">
        <svg viewBox="0 0 160 160" width="100%" height="100%">
          <defs>
            <linearGradient id="il-hero-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#34D399" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#4ADE80" stopOpacity="1" />
            </linearGradient>
          </defs>
          <circle
            cx="80"
            cy="80"
            r={R}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="10"
          />
          <motion.circle
            cx="80"
            cy="80"
            r={R}
            fill="none"
            stroke="url(#il-hero-grad)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            transform="rotate(-90 80 80)"
            initial={reduced ? undefined : { strokeDashoffset: CIRC }}
            animate={{ strokeDashoffset: CIRC * (1 - ratio) }}
            transition={{ duration: reduced ? 0.12 : 0.9, ease: EASE }}
            filter="drop-shadow(0 0 8px rgba(52,211,153,0.35))"
          />
        </svg>
        <div className="il-hero-ring-center">
          <span className="il-hero-eyebrow">צפוי החודש</span>
          <span className="il-hero-value" data-mono="true" dir="ltr">
            {ILS.format(Math.round(expected))}
          </span>
        </div>
      </div>
      <div className="il-hero-body">
        <div className="il-hero-metric">
          <span className="il-hero-metric-label">נכנס עד היום</span>
          <span
            className="il-hero-metric-value"
            data-mono="true"
            dir="ltr"
          >
            {ILS.format(Math.round(received))}
            <span className="il-hero-metric-pct">
              {Math.round(ratio * 100)}%
            </span>
          </span>
        </div>
        <div className="il-hero-metric">
          <span className="il-hero-metric-label">משכורות פעילות</span>
          <span
            className="il-hero-metric-value"
            data-mono="true"
            dir="ltr"
          >
            {activeCount}
          </span>
        </div>
      </div>
    </section>
  );
}

// ── Secondary card ────────────────────────────────────────

function NextIncomeCard({
  next,
}: {
  next: { income: Income; amount: number; date: Date } | null;
}) {
  return (
    <section className="il-next" aria-label="ההכנסה הקרובה">
      <span aria-hidden className="il-next-glyph">
        <CalendarClock className="size-4" />
      </span>
      <div className="il-next-body">
        <span className="il-next-eyebrow">ההכנסה הקרובה</span>
        {next ? (
          <span className="il-next-title">
            {next.income.label} · {DATE_FMT_LONG.format(next.date)}
          </span>
        ) : (
          <span className="il-next-title">אין הכנסה קרובה מוגדרת</span>
        )}
      </div>
      {next ? (
        <span className="il-next-amount" data-mono="true" dir="ltr">
          {ILS.format(Math.round(next.amount))}
        </span>
      ) : null}
    </section>
  );
}

// ── Expandable details ────────────────────────────────────

function ExpandableDetails({
  open,
  onToggle,
  activeCount,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  activeCount: number;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <section className="il-details">
      <button
        type="button"
        className="il-details-head"
        onClick={onToggle}
        aria-expanded={open}
      >
        <div className="il-details-head-text">
          <span className="il-details-eyebrow">
            ערוך משכורות והכנסות
          </span>
          <span className="il-details-title">
            {activeCount} פעילות · בסיס + חד-פעמי
          </span>
        </div>
        <motion.span
          aria-hidden
          className="il-details-arrow"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: reduced ? 0.12 : 0.28, ease: EASE }}
        >
          <ChevronDown className="size-4" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="body"
            initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: reduced ? 0.12 : 0.4, ease: EASE }}
            className="il-details-body"
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

// ── One-off override sheet ───────────────────────────────

function OverrideSheet({
  open,
  onOpenChange,
  incomeId,
  monthKey,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  incomeId: string | null;
  monthKey: string;
}) {
  const income = useFinanceStore((s) =>
    incomeId ? s.incomes.find((i) => i.id === incomeId) ?? null : null,
  );
  const setIncomeActual = useFinanceStore((s) => s.setIncomeActual);
  const currentAmt = income ? incomeForMonth(income, monthKey) : 0;
  const overridden = income?.actualByMonth?.[monthKey] !== undefined;
  const initialValue = useMemo(
    () => (income ? String(Math.round(currentAmt)) : ""),
    [income, currentAmt],
  );
  const [draft, setDraft] = useState<string>(initialValue);

  return (
    <BottomSheet
      key={`${incomeId}-${monthKey}`}
      open={open}
      onOpenChange={(o) => {
        if (o) setDraft(initialValue);
        onOpenChange(o);
      }}
      title={income ? `עדכון ${income.label}` : "עדכון הכנסה"}
      className="il-sheet"
    >
      {income ? (
        <div className="il-sheet-body">
          <span className="il-sheet-eyebrow">
            {formatMonth(monthKey)} · {income.label}
          </span>
          <label className="il-sheet-field">
            <span className="il-sheet-field-label">כמה נכנס בפועל?</span>
            <input
              type="text"
              inputMode="decimal"
              className="il-sheet-input"
              value={draft || initialValue}
              onChange={(e) => setDraft(e.target.value)}
              dir="ltr"
              data-mono="true"
            />
          </label>
          <div className="il-sheet-tip">
            שינוי משפיע רק על החודש הזה. חודש הבא חוזר לבסיס{" "}
            {ILS.format(income.amount)}.
          </div>
          <div className="il-sheet-actions">
            {overridden ? (
              <button
                type="button"
                className="il-sheet-btn il-sheet-btn-ghost"
                onClick={() => {
                  setIncomeActual(income.id, monthKey, null);
                  hapticSuccess();
                  onOpenChange(false);
                }}
              >
                בטל שינוי חד-פעמי
              </button>
            ) : null}
            <button
              type="button"
              className="il-sheet-btn il-sheet-btn-primary"
              onClick={() => {
                const val = Number(
                  (draft || initialValue).replace(/[^\d.-]/g, ""),
                );
                if (Number.isFinite(val) && val >= 0) {
                  setIncomeActual(
                    income.id,
                    monthKey,
                    val === income.amount ? null : val,
                  );
                  hapticSuccess();
                }
                onOpenChange(false);
              }}
            >
              שמור שינוי חד-פעמי
            </button>
          </div>
        </div>
      ) : (
        <div />
      )}
    </BottomSheet>
  );
}

// ── Empty ─────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="ob-empty-hero" dir="rtl">
      <span aria-hidden className="ob-empty-orb" />
      <span className="ob-empty-title">אין הכנסות פעילות</span>
      <span className="ob-empty-hint">
        הגדר משכורת או הכנסה חוזרת בפרופיל כדי לראות תמונת מצב חיה.
      </span>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────

function pickNextIncome(
  incomes: Income[],
  currentMK: string,
  nextMK: string,
): { income: Income; amount: number; date: Date } | null {
  const now = new Date();
  const today = now.getDate();
  const [cY, cM] = mkParts(currentMK);
  const [nY, nM] = mkParts(nextMK);
  const list: Array<{ income: Income; amount: number; date: Date }> = [];
  for (const inc of incomes) {
    if (inc.dayOfMonth >= today) {
      list.push({
        income: inc,
        amount: incomeForMonth(inc, currentMK),
        date: new Date(cY, cM - 1, inc.dayOfMonth),
      });
    }
    list.push({
      income: inc,
      amount: incomeForMonth(inc, nextMK),
      date: new Date(nY, nM - 1, inc.dayOfMonth),
    });
  }
  list.sort((a, b) => a.date.getTime() - b.date.getTime());
  return list[0] ?? null;
}

function mkParts(mk: string): [number, number] {
  const [y, m] = mk.split("-").map((x) => Number(x));
  return [y, m];
}

function formatMonth(mk: string): string {
  const [y, m] = mkParts(mk);
  const d = new Date(y, m - 1, 1);
  return new Intl.DateTimeFormat("he-IL", {
    month: "long",
    year: "numeric",
  }).format(d);
}

void Wallet;
