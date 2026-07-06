"use client";

// Settings · Loans mini-app.
//
// UI-only rebuild. Mirrors the compact card language already
// shipped on Home (ObligationsDashboard loan lane) so switching
// between Home and Settings feels like the same object seen from
// two angles. Data pipeline unchanged: reads store.loans/rules/
// accounts via summarizeLoans + buildObligationsOverview, writes
// via store.addLoan/updateLoan/toggleLoan/deleteLoan through the
// existing full-screen editor.
//
// Layout:
//   • 2 tone-tinted KPI tiles (monthly outflow · total remaining)
//   • Prominent gold "הוסף הלוואה" CTA
//   • One card per loan (name, monthly, remaining balance driven
//     by principal when available, paid/total, next charge,
//     status pill). Tap → LoanFullScreenEdit (edit mode).
//   • Add tap → LoanFullScreenEdit (add mode; principalAmount +
//     auto-summary block already wired).

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Banknote, Plus } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { summarizeLoans } from "@/lib/loan-summary";
import {
  buildObligationsOverview,
  type LoanRow,
} from "@/lib/obligations-overview";
import { LoanFullScreenEdit } from "@/components/loans/loan-fullscreen-edit";
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

export function LoansMiniApp() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const loans = useFinanceStore((s) => s.loans);
  const rules = useFinanceStore((s) => s.rules);
  const accounts = useFinanceStore((s) => s.accounts);
  const [editLoanId, setEditLoanId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const monthKey = currentMonthKey();
  const summary = useMemo(() => {
    if (!hydrated) return null;
    return summarizeLoans({ loans, monthKey });
  }, [hydrated, loans, monthKey]);
  const overview = useMemo(() => {
    if (!hydrated) return null;
    return buildObligationsOverview({ loans, rules, accounts, monthKey });
  }, [hydrated, loans, rules, accounts, monthKey]);

  if (!hydrated || !summary || !overview) return null;

  const rows = overview.loans;

  function openAdd() {
    hapticTap();
    setEditLoanId(null);
    setEditOpen(true);
  }
  function openEdit(id: string) {
    hapticTap();
    setEditLoanId(id);
    setEditOpen(true);
  }

  return (
    <div className="ln-mini" dir="rtl">
      <div className="ln-kpis" role="group" aria-label="סיכום הלוואות">
        <Kpi
          label="תשלום חודשי"
          value={ILS.format(summary.totalMonthly)}
          tone="purple"
          caption={
            summary.activeCount === 0
              ? "אין הלוואות פעילות"
              : summary.activeCount === 1
                ? "הלוואה אחת פעילה"
                : `${summary.activeCount} הלוואות פעילות`
          }
        />
        <Kpi
          label="נותר לתשלום"
          value={ILS.format(summary.totalRemaining)}
          tone="danger"
        />
      </div>

      <button
        type="button"
        className="ln-add"
        onClick={openAdd}
        aria-label="הוסף הלוואה"
      >
        <span className="ln-add-icon" aria-hidden>
          <Plus className="size-4" strokeWidth={2.2} />
        </span>
        <span className="ln-add-label">הוסף הלוואה</span>
      </button>

      {rows.length === 0 ? (
        <div className="ln-empty">
          <span className="ln-empty-icon" aria-hidden>
            <Banknote className="size-5" strokeWidth={1.6} />
          </span>
          <p className="ln-empty-title">עוד אין הלוואות</p>
          <p className="ln-empty-body">
            הוסף הלוואה ראשונה כדי לראות תשלום חודשי, יתרה נותרת ותאריך סיום.
          </p>
        </div>
      ) : (
        <ul className="ln-list">
          {rows.map((row, idx) => (
            <LoanCard
              key={row.loan.id}
              row={row}
              delay={idx * 0.04}
              onClick={() => openEdit(row.loan.id)}
            />
          ))}
        </ul>
      )}

      <LoanFullScreenEdit
        loanId={editLoanId}
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setEditLoanId(null);
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
  tone: "purple" | "danger";
  caption?: string;
}) {
  return (
    <div className="ln-kpi" data-tone={tone}>
      <span className="ln-kpi-label">{label}</span>
      <span className="ln-kpi-value" data-mono="true" dir="ltr">
        {value}
      </span>
      {caption ? <span className="ln-kpi-caption">{caption}</span> : null}
    </div>
  );
}

function LoanCard({
  row,
  delay,
  onClick,
}: {
  row: LoanRow;
  delay: number;
  onClick: () => void;
}) {
  const reduced = useReducedMotion();
  const loan = row.loan;
  const total = loan.totalPayments;
  const paid =
    total !== undefined && row.remainingPayments !== undefined
      ? Math.max(0, total - row.remainingPayments)
      : null;
  const progress =
    total !== undefined && paid !== null && total > 0
      ? Math.max(0, Math.min(1, paid / total))
      : null;

  const statusTone =
    row.status === "ending-soon"
      ? "watch"
      : row.status === "starting-soon"
        ? "safe"
        : loan.active
          ? "neutral"
          : "muted";
  const statusLabel =
    row.status === "ending-soon"
      ? "לקראת סיום"
      : row.status === "starting-soon"
        ? "מתחיל בקרוב"
        : loan.active
          ? "פעיל"
          : "מושהה";

  // Home rule: lead with the actual principal ("לקחתי בפועל").
  // Fall back to remainingBalance if principal not set.
  const principal = loan.principalAmount;
  const primaryLabel = principal !== undefined ? "לקחתי בפועל" : "יתרה נוכחית";
  const primaryValue =
    principal !== undefined
      ? ILS.format(principal)
      : ILS.format(row.monthlyAmount * (row.remainingPayments ?? 0));

  return (
    <motion.li
      layout
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: reduced ? 0.12 : 0.42, ease: EASE }}
      className="ln-card"
    >
      <button
        type="button"
        onClick={onClick}
        className="ln-card-surface"
        aria-label={`ערוך את ההלוואה ${loan.label}`}
      >
        <div className="ln-card-head">
          <span aria-hidden className="ln-card-icon">
            <Banknote className="size-5" strokeWidth={1.6} />
          </span>
          <div className="ln-card-titles">
            <span className="ln-card-title">{loan.label}</span>
            <span className="ln-card-sub">
              {row.paymentLabel
                ? `תשלום ${row.paymentLabel}`
                : loan.active
                  ? "הלוואה פעילה"
                  : "הלוואה מושהית"}
            </span>
          </div>
          <span className={`ln-card-status ln-tone-${statusTone}`}>
            {statusLabel}
          </span>
        </div>

        <div className="ln-card-money">
          <div className="ln-card-money-block">
            <span className="ln-card-money-label">{primaryLabel}</span>
            <span className="ln-card-money-value" data-mono="true" dir="ltr">
              {primaryValue}
            </span>
          </div>
          <div className="ln-card-money-block">
            <span className="ln-card-money-label">חיוב חודשי</span>
            <span className="ln-card-money-value" data-mono="true" dir="ltr">
              {ILS.format(loan.monthlyInstallment)}
            </span>
          </div>
          <div className="ln-card-money-block">
            <span className="ln-card-money-label">חיוב הבא</span>
            <span className="ln-card-money-value" data-mono="true" dir="ltr">
              {DATE_FMT.format(row.nextChargeDate)}
            </span>
          </div>
        </div>

        {progress !== null ? (
          <div className="ln-card-progress">
            <div className="ln-card-progress-track">
              <motion.div
                className="ln-card-progress-fill"
                initial={{ width: reduced ? `${progress * 100}%` : 0 }}
                animate={{ width: `${progress * 100}%` }}
                transition={{ duration: reduced ? 0.12 : 0.9, ease: EASE }}
              />
            </div>
            <div className="ln-card-progress-labels">
              <span data-mono="true" dir="ltr">
                {paid}/{total}
              </span>
              <span>{Math.round((progress ?? 0) * 100)}% שולם</span>
            </div>
          </div>
        ) : null}
      </button>
    </motion.li>
  );
}
