"use client";

// Settings · Income mini-app.
//
// UI-only rebuild that mirrors the Loans mini-app card language.
// Cards show: name, expected amount, expected date, status pill
// (התקבל / התקבל חלקית / צפי / חסר / מושהה), and — when an actual
// exists — a variance chip ("התקבל 98% מהצפי"). Tap → the extended
// IncomeFullScreenEdit which now carries both baseline fields and
// a per-month actual section. Every write flows through the
// existing store surface (updateIncome / addIncome / setIncomeActual),
// so Home / Time / Insights / expected-EOM all read the same source.

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { HandCoins, Plus } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import {
  buildEngineCtx,
  getMonthlyIncome,
} from "@/lib/financial-engine";
import { currentMonthKey, dayWithinMonth } from "@/lib/dates";
import { incomeForMonth } from "@/lib/income-month";
import { IncomeFullScreenEdit } from "@/components/income/income-fullscreen-edit";
import { tap as hapticTap } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const DATE_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
});
const EASE = [0.32, 0.72, 0, 1] as const;

type Tone = "safe" | "watch" | "danger" | "muted";

type StatusView = {
  label: string;
  tone: Tone;
};

function classify({
  active,
  hasActual,
  pct,
  isFuture,
}: {
  active: boolean;
  hasActual: boolean;
  pct: number | null;
  isFuture: boolean;
}): StatusView {
  if (!active) return { label: "מושהה", tone: "muted" };
  if (hasActual && pct !== null) {
    if (pct >= 97 && pct <= 103) return { label: "התקבל", tone: "safe" };
    if (pct > 103) return { label: "התקבל", tone: "safe" };
    if (pct >= 50) return { label: "התקבל חלקית", tone: "watch" };
    return { label: "חסר", tone: "danger" };
  }
  if (isFuture) return { label: "צפי", tone: "watch" };
  return { label: "חסר", tone: "danger" };
}

export function IncomeMiniApp() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const incomes = useFinanceStore((s) => s.incomes);
  const accounts = useFinanceStore((s) => s.accounts);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);
  const loans = useFinanceStore((s) => s.loans);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const monthKey = currentMonthKey();
  const now = useMemo(() => new Date(), []);

  const totalExpected = incomes
    .filter((i) => i.active && i.amount > 0)
    .reduce((s, i) => s + i.amount, 0);

  const ctx = useMemo(() => {
    if (!hydrated) return null;
    return buildEngineCtx({
      accounts,
      rules,
      statuses,
      entries,
      loans,
      incomes,
      monthlyBudget,
    });
  }, [hydrated, accounts, rules, statuses, entries, loans, incomes, monthlyBudget]);
  const totalActualThisMonth = ctx
    ? getMonthlyIncome(ctx).total
    : totalExpected;

  function openAdd() {
    hapticTap();
    setEditingId(null);
    setEditOpen(true);
  }
  function openEdit(id: string) {
    hapticTap();
    setEditingId(id);
    setEditOpen(true);
  }

  if (!hydrated) return null;

  const variance = totalActualThisMonth - totalExpected;
  const varianceCaption =
    totalExpected === 0
      ? "אין הכנסות פעילות"
      : variance === 0
        ? "כצפי בדיוק"
        : variance > 0
          ? `+${ILS.format(Math.round(variance))} מעל הצפי`
          : `${ILS.format(Math.round(variance))} מתחת לצפי`;

  const activeCount = incomes.filter((i) => i.active).length;

  const sorted = incomes
    .slice()
    .sort((a, b) => a.dayOfMonth - b.dayOfMonth);

  return (
    <div className="in-mini" dir="rtl">
      <div className="in-kpis" role="group" aria-label="סיכום הכנסות">
        <Kpi
          label="צפי החודש"
          value={ILS.format(totalExpected)}
          tone="gold"
          caption={
            activeCount === 0
              ? "אין הכנסות פעילות"
              : activeCount === 1
                ? "מקור אחד פעיל"
                : `${activeCount} מקורות פעילים`
          }
        />
        <Kpi
          label="התקבל בפועל"
          value={ILS.format(Math.round(totalActualThisMonth))}
          tone="safe"
          caption={varianceCaption}
        />
      </div>

      <button
        type="button"
        className="in-add"
        onClick={openAdd}
        aria-label="הוסף הכנסה"
      >
        <span className="in-add-icon" aria-hidden>
          <Plus className="size-4" strokeWidth={2.2} />
        </span>
        <span className="in-add-label">הוסף הכנסה</span>
      </button>

      {incomes.length === 0 ? (
        <div className="in-empty">
          <span className="in-empty-icon" aria-hidden>
            <HandCoins className="size-5" strokeWidth={1.6} />
          </span>
          <p className="in-empty-title">עוד אין הכנסות</p>
          <p className="in-empty-body">
            הוסף משכורת / פנסיה / צד-משלח. Pulse יציג את ההכנסה הקרובה על ציר
            הזמן ויחזה את היתרה לסוף החודש.
          </p>
        </div>
      ) : (
        <ul className="in-list">
          {sorted.map((inc, idx) => (
            <IncomeCard
              key={inc.id}
              inc={inc}
              monthKey={monthKey}
              now={now}
              delay={idx * 0.04}
              onClick={() => openEdit(inc.id)}
            />
          ))}
        </ul>
      )}

      <IncomeFullScreenEdit
        incomeId={editingId}
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setEditingId(null);
        }}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
  caption,
}: {
  label: string;
  value: string;
  tone: "gold" | "safe";
  caption?: string;
}) {
  return (
    <div className="in-kpi" data-tone={tone}>
      <span className="in-kpi-label">{label}</span>
      <span className="in-kpi-value" data-mono="true" dir="ltr">
        {value}
      </span>
      {caption ? <span className="in-kpi-caption">{caption}</span> : null}
    </div>
  );
}

function IncomeCard({
  inc,
  monthKey,
  now,
  delay,
  onClick,
}: {
  inc: import("@/types/finance").Income;
  monthKey: string;
  now: Date;
  delay: number;
  onClick: () => void;
}) {
  const reduced = useReducedMotion();
  const expected = inc.amount;
  const actual = incomeForMonth(inc, monthKey);
  const hasActual = inc.actualByMonth?.[monthKey] !== undefined;
  const payday = dayWithinMonth(monthKey, inc.dayOfMonth);
  const isFuture = payday.getTime() > now.getTime();
  const pct = expected > 0 ? Math.round((actual / expected) * 100) : null;
  const delta = hasActual ? actual - expected : 0;
  const status = classify({
    active: inc.active,
    hasActual,
    pct,
    isFuture,
  });

  const daysToPayday = Math.max(
    0,
    Math.floor((payday.getTime() - now.getTime()) / 86_400_000),
  );
  const dateSubtitle = isFuture
    ? daysToPayday === 0
      ? "מועד התשלום היום"
      : daysToPayday === 1
        ? "מחר"
        : `בעוד ${daysToPayday} ימים · יום ${inc.dayOfMonth}`
    : hasActual
      ? `יום ${inc.dayOfMonth} · התקבל`
      : `יום ${inc.dayOfMonth} · עבר ${Math.floor(
          (now.getTime() - payday.getTime()) / 86_400_000,
        )} ימים`;

  return (
    <motion.li
      layout
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: reduced ? 0.12 : 0.42, ease: EASE }}
      className="in-card"
    >
      <button
        type="button"
        onClick={onClick}
        className="in-card-surface"
        aria-label={`ערוך את מקור ההכנסה ${inc.label}`}
      >
        <div className="in-card-head">
          <span aria-hidden className="in-card-icon">
            <HandCoins className="size-5" strokeWidth={1.6} />
          </span>
          <div className="in-card-titles">
            <span className="in-card-title">{inc.label}</span>
            <span className="in-card-sub">{dateSubtitle}</span>
          </div>
          <span className={`in-card-status in-tone-${status.tone}`}>
            {status.label}
          </span>
        </div>

        <div className="in-card-money">
          <div className="in-card-money-block">
            <span className="in-card-money-label">צפי</span>
            <span className="in-card-money-value" data-mono="true" dir="ltr">
              +{ILS.format(expected)}
            </span>
          </div>
          {hasActual ? (
            <div className="in-card-money-block">
              <span className="in-card-money-label">בפועל</span>
              <span className="in-card-money-value" data-mono="true" dir="ltr">
                +{ILS.format(Math.round(actual))}
              </span>
            </div>
          ) : (
            <div className="in-card-money-block">
              <span className="in-card-money-label">תאריך צפוי</span>
              <span className="in-card-money-value" data-mono="true" dir="ltr">
                {DATE_FMT.format(payday)}
              </span>
            </div>
          )}
          <div className="in-card-money-block">
            <span className="in-card-money-label">
              {hasActual ? "התאמה לצפי" : "יום החודש"}
            </span>
            <span className="in-card-money-value" data-mono="true" dir="ltr">
              {hasActual && pct !== null
                ? `${pct}%`
                : `יום ${inc.dayOfMonth}`}
            </span>
          </div>
        </div>

        {hasActual && expected > 0 && pct !== null ? (
          <div className="in-card-variance" data-tone={status.tone}>
            <span className="in-card-variance-line">
              התקבל {pct}% מהצפי
              {delta !== 0 ? (
                <>
                  {" · "}
                  <span data-mono="true" dir="ltr">
                    {delta >= 0 ? "+" : "−"}
                    {ILS.format(Math.round(Math.abs(delta)))}
                  </span>
                </>
              ) : null}
            </span>
          </div>
        ) : null}
      </button>
    </motion.li>
  );
}
