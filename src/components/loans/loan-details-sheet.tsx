"use client";

// Home · Loan smart edit + details sheet.
//
// Opens when the user taps a loan card in the Home Obligations
// dashboard. Presents a premium calculation summary of the loan
// (what was actually borrowed vs total repayment vs interest cost)
// alongside an inline edit block that lets the user correct any of
// the loan's core fields.
//
// Writes go through the pre-existing store.updateLoan mechanism —
// which was extended to persist startMonth / startYear /
// totalPayments / principalAmount in the same commit. Zero engine
// change; the CFO forecast, liquidity curve, EOM projection, and
// Time-tab checkpoints continue to project cash flow from
// monthlyInstallment × schedule.

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Banknote,
  CalendarClock,
  Check,
  Coins,
  Pencil,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { loanSchedule } from "@/lib/installment-schedule";
import {
  tap as hapticTap,
  success as hapticSuccess,
} from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const MONTH_NAMES = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

export function LoanDetailsSheet({
  loanId,
  open,
  onOpenChange,
}: {
  loanId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [openCount, setOpenCount] = useState(0);
  function handleOpenChange(next: boolean) {
    if (next) setOpenCount((c) => c + 1);
    onOpenChange(next);
  }
  return (
    <BottomSheet
      open={open}
      onOpenChange={handleOpenChange}
      title="פרטי הלוואה"
      className="ld-sheet"
    >
      {loanId ? (
        <LoanDetailsBody
          key={`${loanId}-${openCount}`}
          loanId={loanId}
          onClose={() => onOpenChange(false)}
        />
      ) : (
        <div />
      )}
    </BottomSheet>
  );
}

function LoanDetailsBody({
  loanId,
  onClose,
}: {
  loanId: string;
  onClose: () => void;
}) {
  const loan = useFinanceStore(
    (s) => s.loans.find((l) => l.id === loanId) ?? null,
  );
  const updateLoan = useFinanceStore((s) => s.updateLoan);
  const deleteLoan = useFinanceStore((s) => s.deleteLoan);

  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(loan?.label ?? "");
  const [principal, setPrincipal] = useState<string>(
    loan?.principalAmount !== undefined ? String(loan.principalAmount) : "",
  );
  const [monthly, setMonthly] = useState<string>(
    loan ? String(loan.monthlyInstallment) : "",
  );
  const [total, setTotal] = useState<string>(
    loan?.totalPayments ? String(loan.totalPayments) : "",
  );
  const [dayOfMonth, setDayOfMonth] = useState<string>(
    loan ? String(loan.dayOfMonth) : "",
  );
  const [startMonth, setStartMonth] = useState<string>(
    loan?.startMonth ? String(loan.startMonth) : "",
  );
  const [startYear, setStartYear] = useState<string>(
    loan?.startYear ? String(loan.startYear) : "",
  );

  const sched = useMemo(() => {
    if (!loan) return null;
    return loanSchedule(loan, currentMonthKey());
  }, [loan]);

  const monthlyNumber = Number(monthly.replace(/[^\d.-]/g, "")) || 0;
  const totalPaymentsNumber = Math.max(
    1,
    Math.floor(Number(total.replace(/[^\d.-]/g, "")) || 0),
  );
  const principalNumber = principal
    ? Number(principal.replace(/[^\d.-]/g, "")) || 0
    : loan?.principalAmount ?? 0;

  // Derived — always from the currently entered draft when editing,
  // else from persisted loan values.
  const activeMonthly = editing ? monthlyNumber : loan?.monthlyInstallment ?? 0;
  const activeTotal = editing
    ? totalPaymentsNumber
    : loan?.totalPayments ?? 0;
  const activePrincipal = editing
    ? principalNumber
    : loan?.principalAmount ?? 0;

  const totalRepay = activeMonthly * (activeTotal || 0);
  const interestCost =
    activePrincipal > 0 ? Math.max(0, totalRepay - activePrincipal) : 0;
  const monthlyInterest =
    activeTotal > 0 ? Math.round(interestCost / activeTotal) : 0;
  const remainingPayments = sched?.remaining ?? 0;
  const paymentNumber = sched?.paymentNumber ?? 0;
  const remainingBalance = remainingPayments * (loan?.monthlyInstallment ?? 0);
  const nextChargeDate = computeNextCharge(loan?.dayOfMonth ?? 1);

  function commitEdits() {
    if (!loan) return;
    const patch: Parameters<typeof updateLoan>[1] = {};
    if (label.trim() && label.trim() !== loan.label) {
      patch.label = label.trim();
    }
    if (monthlyNumber > 0 && monthlyNumber !== loan.monthlyInstallment) {
      patch.monthlyInstallment = monthlyNumber;
    }
    if (
      totalPaymentsNumber > 0 &&
      totalPaymentsNumber !== loan.totalPayments
    ) {
      patch.totalPayments = totalPaymentsNumber;
    }
    const d = Math.max(1, Math.min(31, Number(dayOfMonth) || 0));
    if (d && d !== loan.dayOfMonth) patch.dayOfMonth = d;
    const sm = Number(startMonth) || 0;
    if (sm >= 1 && sm <= 12 && sm !== loan.startMonth) patch.startMonth = sm;
    const sy = Number(startYear) || 0;
    if (sy >= 2000 && sy <= 2100 && sy !== loan.startYear) {
      patch.startYear = sy;
    }
    if (
      principal !== "" &&
      principalNumber > 0 &&
      principalNumber !== loan.principalAmount
    ) {
      patch.principalAmount = principalNumber;
    }
    const changedKeys = Object.keys(patch);
    if (changedKeys.length === 0) {
      toast.info("אין שינוי לשמור");
      setEditing(false);
      return;
    }
    updateLoan(loan.id, patch);
    hapticSuccess();
    toast.success(`נשמרו ${changedKeys.length} עדכונים · תחזית תעודכן`);
    setEditing(false);
  }

  function requestDelete() {
    if (!loan) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`למחוק את ההלוואה '${loan.label}'?`)
    ) {
      return;
    }
    deleteLoan(loan.id);
    hapticSuccess();
    toast.success("הלוואה נמחקה");
    onClose();
  }

  if (!loan) {
    return (
      <div className="ld-body" dir="rtl">
        <div className="ld-empty">ההלוואה לא נמצאה או נמחקה.</div>
      </div>
    );
  }

  return (
    <div className="ld-body" dir="rtl">
      <header className="ld-header">
        <div className="ld-header-text">
          <span className="ld-eyebrow">הלוואה · פרטי מימון</span>
          {editing ? (
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="ld-title-input"
              aria-label="שם הלוואה"
              dir="rtl"
            />
          ) : (
            <span className="ld-title">{loan.label}</span>
          )}
        </div>
        <div className="ld-header-actions">
          {editing ? (
            <>
              <button
                type="button"
                className="ld-icon-btn"
                onClick={() => {
                  hapticTap();
                  setEditing(false);
                  // reset drafts
                  setLabel(loan.label);
                  setPrincipal(
                    loan.principalAmount !== undefined
                      ? String(loan.principalAmount)
                      : "",
                  );
                  setMonthly(String(loan.monthlyInstallment));
                  setTotal(loan.totalPayments ? String(loan.totalPayments) : "");
                  setDayOfMonth(String(loan.dayOfMonth));
                  setStartMonth(
                    loan.startMonth ? String(loan.startMonth) : "",
                  );
                  setStartYear(loan.startYear ? String(loan.startYear) : "");
                }}
                aria-label="בטל עריכה"
              >
                <X className="size-4" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="ld-icon-btn"
                onClick={() => {
                  hapticTap();
                  setEditing(true);
                }}
                aria-label="ערוך הלוואה"
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                className="ld-icon-btn ld-icon-btn-danger"
                onClick={requestDelete}
                aria-label="מחק הלוואה"
              >
                <Trash2 className="size-4" />
              </button>
            </>
          )}
        </div>
      </header>

      <div className="ld-metrics">
        <Metric
          icon={<Coins className="size-4" />}
          label="לקחתי בפועל"
          value={
            activePrincipal > 0
              ? ILS.format(Math.round(activePrincipal))
              : "לא הוזן"
          }
          tone="safe"
          highlight
        />
        <Metric
          icon={<Wallet className="size-4" />}
          label="אחזיר בסך הכל"
          value={ILS.format(Math.round(totalRepay))}
          tone="purple"
          highlight
        />
        <Metric
          icon={<Banknote className="size-4" />}
          label="עלות ריבית/פער"
          value={
            activePrincipal > 0
              ? `${ILS.format(Math.round(interestCost))}`
              : "—"
          }
          sub={
            activePrincipal > 0
              ? `≈ ${ILS.format(monthlyInterest)}/ח׳`
              : undefined
          }
          tone="watch"
        />
        <Metric
          icon={<Wallet className="size-4" />}
          label="תשלום חודשי"
          value={ILS.format(Math.round(activeMonthly))}
          tone="purple"
        />
        <Metric
          icon={<CalendarClock className="size-4" />}
          label="נותרו תשלומים"
          value={
            activeTotal > 0
              ? `${remainingPayments}/${activeTotal}`
              : `${remainingPayments}`
          }
          sub={
            paymentNumber > 0 && activeTotal > 0
              ? `תשלום ${paymentNumber}/${activeTotal}`
              : undefined
          }
          tone="cyan"
        />
        <Metric
          icon={<CalendarClock className="size-4" />}
          label="חיוב הבא"
          value={formatDate(nextChargeDate)}
          sub={
            remainingBalance > 0
              ? `יתרת חוב ${ILS.format(Math.round(remainingBalance))}`
              : undefined
          }
          tone="cyan"
        />
      </div>

      <AnimatePresence initial={false}>
        {editing ? (
          <motion.section
            key="edit"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
            className="ld-edit"
          >
            <h3 className="ld-edit-title">עריכה מהירה</h3>
            <div className="ld-edit-grid">
              <Field
                label="סכום שנלקח בפועל (₪)"
                value={principal}
                onChange={setPrincipal}
                placeholder="לדוגמה 50000"
              />
              <Field
                label="תשלום חודשי (₪)"
                value={monthly}
                onChange={setMonthly}
                placeholder="לדוגמה 870"
              />
              <Field
                label="מספר תשלומים"
                value={total}
                onChange={setTotal}
                placeholder="לדוגמה 60"
              />
              <Field
                label="יום בחודש"
                value={dayOfMonth}
                onChange={setDayOfMonth}
                placeholder="1-31"
              />
              <Field
                label="חודש התחלה (1-12)"
                value={startMonth}
                onChange={setStartMonth}
                placeholder="1-12"
              />
              <Field
                label="שנת התחלה"
                value={startYear}
                onChange={setStartYear}
                placeholder={String(new Date().getFullYear())}
              />
            </div>
            {startMonth && startYear ? (
              <p className="ld-edit-hint">
                מתחיל: {MONTH_NAMES[(Number(startMonth) || 1) - 1]}{" "}
                {startYear}
              </p>
            ) : null}
          </motion.section>
        ) : null}
      </AnimatePresence>

      <footer className="ld-footer">
        {editing ? (
          <>
            <button
              type="button"
              className="ld-btn ld-btn-ghost"
              onClick={() => {
                hapticTap();
                setEditing(false);
              }}
            >
              <X className="size-4" />
              ביטול
            </button>
            <button
              type="button"
              className="ld-btn ld-btn-primary"
              onClick={commitEdits}
            >
              <Check className="size-4" />
              שמור שינויים
            </button>
          </>
        ) : (
          <button
            type="button"
            className="ld-btn ld-btn-primary"
            onClick={() => {
              hapticTap();
              setEditing(true);
            }}
          >
            <Pencil className="size-4" />
            ערוך פרטי הלוואה
          </button>
        )}
      </footer>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  sub,
  tone,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: "safe" | "watch" | "purple" | "cyan";
  highlight?: boolean;
}) {
  return (
    <div className="ld-metric" data-tone={tone} data-highlight={highlight ? "true" : undefined}>
      <span aria-hidden className="ld-metric-icon">
        {icon}
      </span>
      <span className="ld-metric-label">{label}</span>
      <span className="ld-metric-value" data-mono="true" dir="ltr">
        {value}
      </span>
      {sub ? <span className="ld-metric-sub">{sub}</span> : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="ld-field">
      <span className="ld-field-label">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        className="ld-field-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        dir="ltr"
        data-mono="true"
      />
    </label>
  );
}

function computeNextCharge(dayOfMonth: number): Date {
  const now = new Date();
  const today = now.getDate();
  const clamped = Math.max(1, Math.min(31, dayOfMonth));
  if (clamped >= today) return new Date(now.getFullYear(), now.getMonth(), clamped);
  return new Date(now.getFullYear(), now.getMonth() + 1, clamped);
}
function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}
