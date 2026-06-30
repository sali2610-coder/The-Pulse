"use client";

// Phase 443 · AURORA recovery — Loans Center
//
// Workspace for every active loan. UI-only consumer of useAuroraLoans
// (which itself reads buildObligationsOverview). No engine math.

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { Eyebrow } from "@/components/aurora/aurora-eyebrow";
import { GlassCard } from "@/components/aurora/aurora-glass-card";
import { DigitOdometer } from "@/components/aurora/aurora-digit-odometer";

import {
  useAuroraLoans,
  type AuroraLoanRow,
  type AuroraLoansData,
} from "./use-aurora-loans";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const PCT = new Intl.NumberFormat("he-IL", {
  style: "percent",
  maximumFractionDigits: 0,
});
const DATE_FMT = new Intl.DateTimeFormat("he-IL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

type Tone = "safe" | "watch" | "starting";

function statusTone(status: AuroraLoanRow["status"]): Tone {
  if (status === "ending-soon") return "safe";
  if (status === "starting-soon") return "starting";
  return "watch";
}

function statusLabel(status: AuroraLoanRow["status"]): string {
  if (status === "ending-soon") return "מתקרבת לסיום";
  if (status === "starting-soon") return "מתחילה בקרוב";
  return "פעילה";
}

function toneColor(t: Tone): string {
  if (t === "safe") return "var(--aurora-state-safe)";
  if (t === "starting") return "var(--aurora-brand-aurora-2)";
  return "var(--aurora-state-watch)";
}

export function AuroraLoansCenter() {
  const data = useAuroraLoans();
  const [openId, setOpenId] = useState<string | null>(null);

  if (!data.ready || data.rows.length === 0) {
    if (data.ready) {
      return (
        <GlassCard elevation="elev-1" padding="spacious" radius="hero">
          <Eyebrow srHeading={{ level: 3, text: "מרכז הלוואות" }}>
            מרכז הלוואות
          </Eyebrow>
          <p className="aurora-body aurora-ink-3 aurora-card-foot">
            אין הלוואות פעילות. הוסף הלוואה בהגדרות כדי להפעיל את חיזוי החיובים.
          </p>
        </GlassCard>
      );
    }
    return null;
  }

  return (
    <GlassCard elevation="elev-1" padding="spacious" radius="hero">
      <Header data={data} />
      <SummaryGrid data={data} />
      <ul className="aurora-loans-list">
        {data.rows.map((row) => (
          <LoanRowView
            key={row.id}
            row={row}
            open={openId === row.id}
            onToggle={() =>
              setOpenId((p) => (p === row.id ? null : row.id))
            }
          />
        ))}
      </ul>
      <UpcomingStrip rows={data.rows} />
    </GlassCard>
  );
}

function Header({ data }: { data: AuroraLoansData }) {
  return (
    <div className="aurora-card-row-top">
      <Eyebrow srHeading={{ level: 3, text: "מרכז הלוואות" }}>
        מרכז הלוואות · {data.monthLabel}
      </Eyebrow>
      <span dir="ltr" className="aurora-loans-sum">
        {ILS.format(data.totalMonthly)}/חודש
      </span>
    </div>
  );
}

function SummaryGrid({ data }: { data: AuroraLoansData }) {
  const reduced = useReducedMotion();
  return (
    <>
      <div className="aurora-loans-summary-grid">
        <SummaryCell
          eyebrow="חיוב חודשי"
          dir="ltr"
          headline={ILS.format(data.totalMonthly)}
          hint={`${data.activeCount} הלוואות פעילות`}
        />
        <SummaryCell
          eyebrow="יתרת חוב"
          dir="ltr"
          headline={ILS.format(data.totalRemaining)}
          hint={
            data.totalOriginal > 0
              ? `מתוך ${ILS.format(data.totalOriginal)} מקוריים`
              : "—"
          }
          accent="var(--aurora-state-watch)"
        />
        <SummaryCell
          eyebrow="נפרע עד היום"
          dir="ltr"
          headline={ILS.format(data.paidSoFar)}
          hint={
            data.totalProgress > 0
              ? `${PCT.format(data.totalProgress)} מהמסלולים`
              : "—"
          }
          accent="var(--aurora-state-safe)"
        />
      </div>

      {data.totalOriginal > 0 ? (
        <div className="aurora-loans-progress-row" aria-hidden>
          <div className="aurora-loans-progress-bar">
            <motion.span
              className="aurora-loans-progress-fill"
              initial={reduced ? { width: `${data.totalProgress * 100}%` } : { width: 0 }}
              animate={{ width: `${data.totalProgress * 100}%` }}
              transition={{ duration: reduced ? 0.12 : 0.8, ease: [0.32, 0.72, 0, 1] }}
            />
          </div>
          <span className="aurora-loans-progress-label">
            {PCT.format(data.totalProgress)} מהמסלולים שולמו
          </span>
        </div>
      ) : null}
    </>
  );
}

function SummaryCell({
  eyebrow,
  headline,
  hint,
  accent,
}: {
  eyebrow: string;
  headline: string;
  hint: string;
  accent?: string;
  dir?: string;
}) {
  return (
    <div className="aurora-loans-summary-cell">
      <Eyebrow>{eyebrow}</Eyebrow>
      <span
        dir="ltr"
        className="aurora-loans-summary-amount"
        style={{ color: accent ?? "var(--aurora-ink-1)" }}
      >
        {headline}
      </span>
      <span className="aurora-loans-summary-hint">{hint}</span>
    </div>
  );
}

function LoanRowView({
  row,
  open,
  onToggle,
}: {
  row: AuroraLoanRow;
  open: boolean;
  onToggle: () => void;
}) {
  const reduced = useReducedMotion();
  const tone = statusTone(row.status);
  const tint = toneColor(tone);

  return (
    <li className="aurora-loan-li">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="aurora-loan-button"
        style={{ borderColor: `${tint}55` }}
      >
        <span
          aria-hidden
          className="aurora-loan-chip"
          style={{ background: `${tint}1f`, color: tint }}
        >
          <LoanGlyph />
        </span>
        <div className="aurora-loan-body">
          <div className="aurora-loan-head">
            <span className="aurora-loan-title">{row.label}</span>
            <span
              className="aurora-loan-status"
              style={{ borderColor: `${tint}55`, color: tint }}
            >
              {statusLabel(row.status)}
            </span>
          </div>
          <div className="aurora-loan-headline">
            <span className="aurora-loan-amount" dir="ltr">
              <DigitOdometer value={ILS.format(row.monthlyInstallment)} />
            </span>
            <span className="aurora-loan-amount-hint">לחודש</span>
          </div>
          <LoanProgressLine row={row} tint={tint} />
        </div>
        <motion.span
          aria-hidden
          className="aurora-card-row-chevron"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        >
          ▾
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            className="aurora-loan-detail"
            initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: reduced ? 0.12 : 0.3, ease: [0.32, 0.72, 0, 1] }}
          >
            <LoanDetail row={row} tint={tint} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

function LoanProgressLine({ row, tint }: { row: AuroraLoanRow; tint: string }) {
  const reduced = useReducedMotion();
  return (
    <div className="aurora-loan-progress">
      <div className="aurora-loan-progress-bar" aria-hidden>
        <motion.span
          className="aurora-loan-progress-fill"
          initial={reduced ? { width: `${row.progress * 100}%` } : { width: 0 }}
          animate={{ width: `${row.progress * 100}%` }}
          transition={{ duration: reduced ? 0.12 : 0.7, ease: [0.32, 0.72, 0, 1] }}
          style={{ background: tint, boxShadow: `0 0 12px ${tint}66` }}
        />
      </div>
      <div className="aurora-loan-progress-foot">
        <span dir="ltr">
          {row.paymentLabel ?? (row.totalPayments ? `${row.paidPayments ?? 0}/${row.totalPayments}` : "")}
        </span>
        <span dir="ltr">{PCT.format(row.progress)}</span>
      </div>
    </div>
  );
}

function LoanDetail({ row, tint }: { row: AuroraLoanRow; tint: string }) {
  return (
    <div className="aurora-loan-detail-stack">
      <div className="aurora-loan-grid">
        <Cell
          eyebrow="חיוב חודשי"
          value={ILS.format(row.monthlyInstallment)}
          accent={tint}
        />
        <Cell
          eyebrow="חיוב הקרוב"
          value={`${DATE_FMT.format(new Date(row.nextChargeDate))} · ${ILS.format(row.monthlyAmount)}`}
          accent="var(--aurora-ink-1)"
        />
        <Cell
          eyebrow="יתרת חוב"
          value={
            row.remainingBalance !== undefined
              ? ILS.format(row.remainingBalance)
              : "—"
          }
          accent="var(--aurora-state-watch)"
          hint={row.isLegacyRemaining ? "ערך מקור: שדה ידני" : undefined}
        />
        <Cell
          eyebrow="קרן ששולמה"
          value={
            row.paidBalance !== undefined
              ? ILS.format(row.paidBalance)
              : "—"
          }
          accent="var(--aurora-state-safe)"
        />
        <Cell
          eyebrow="סכום מקורי"
          value={
            row.originalAmount !== undefined
              ? ILS.format(row.originalAmount)
              : "—"
          }
          accent="var(--aurora-ink-1)"
        />
        <Cell
          eyebrow="תשלומים שנותרו"
          value={
            row.remainingPayments !== undefined
              ? `${row.remainingPayments}`
              : "—"
          }
          accent="var(--aurora-ink-1)"
          hint={
            row.totalPayments !== undefined
              ? `מתוך ${row.totalPayments} סך הכל`
              : undefined
          }
        />
        <Cell
          eyebrow="יום חיוב"
          value={`כל ${row.nextChargeDay} בחודש`}
          accent="var(--aurora-ink-1)"
        />
        <Cell
          eyebrow="סיום צפוי"
          value={row.endLabel ?? "—"}
          accent="var(--aurora-state-safe)"
        />
      </div>

      <p className="aurora-body aurora-ink-3">
        {row.status === "ending-soon"
          ? "ההלוואה תסתיים תוך פחות מרבעון. שווה לתכנן את התזרים שיתפנה."
          : row.status === "starting-soon"
            ? "ההלוואה תופיע בלוח הזמנים בחודש הקרוב. החיוב הראשון כבר מופיע בחיזוי."
            : "ההלוואה רצה במסלול קבוע. החיובים מסתנכרנים אוטומטית עם מנוע התחזית של Pulse."}
      </p>
    </div>
  );
}

function Cell({
  eyebrow,
  value,
  accent,
  hint,
}: {
  eyebrow: string;
  value: string;
  accent: string;
  hint?: string;
}) {
  return (
    <div className="aurora-loan-cell" style={{ borderColor: "var(--aurora-hairline-quiet)" }}>
      <span className="aurora-loan-cell-eyebrow">{eyebrow}</span>
      <span dir="ltr" className="aurora-loan-cell-value" style={{ color: accent }}>
        {value}
      </span>
      {hint ? <span className="aurora-loan-cell-hint">{hint}</span> : null}
    </div>
  );
}

function UpcomingStrip({ rows }: { rows: AuroraLoanRow[] }) {
  const upcoming = [...rows]
    .filter((r) => r.active)
    .sort((a, b) =>
      new Date(a.nextChargeDate).getTime() - new Date(b.nextChargeDate).getTime(),
    )
    .slice(0, 5);
  if (upcoming.length === 0) return null;
  return (
    <section className="aurora-loans-upcoming">
      <Eyebrow>חיובים קרובים</Eyebrow>
      <ul className="aurora-loans-upcoming-list">
        {upcoming.map((row) => (
          <li key={`upcoming-${row.id}`}>
            <span className="aurora-loans-upcoming-date">
              {DATE_FMT.format(new Date(row.nextChargeDate))}
            </span>
            <span className="aurora-loans-upcoming-label">{row.label}</span>
            <span dir="ltr" className="aurora-loans-upcoming-amount">
              {ILS.format(row.monthlyInstallment)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LoanGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden fill="none">
      <path
        d="M3 8h16M3 14h16M6 5l10 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
