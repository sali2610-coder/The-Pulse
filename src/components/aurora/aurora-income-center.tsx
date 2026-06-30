"use client";

// Phase 444 · AURORA recovery — Income & Salaries Center
//
// Premium income workspace. UI-only consumer of useAuroraIncome
// (which reads incomeBreakdown + incomeForMonth). No engine math.

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { Eyebrow } from "@/components/aurora/aurora-eyebrow";
import { GlassCard } from "@/components/aurora/aurora-glass-card";
import { DigitOdometer } from "@/components/aurora/aurora-digit-odometer";

import {
  useAuroraIncome,
  type AuroraIncomeData,
  type AuroraIncomeRow,
} from "./use-aurora-income";

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

const TREND_LABELS = ["−5ח׳", "−4ח׳", "−3ח׳", "−2ח׳", "−1ח׳", "החודש"];

type Tone = "safe" | "watch" | "info";
function statusTone(status: AuroraIncomeRow["status"]): Tone {
  if (status === "received") return "safe";
  if (status === "missing") return "watch";
  return "info";
}
function statusLabel(status: AuroraIncomeRow["status"]): string {
  switch (status) {
    case "received":
      return "התקבל";
    case "missing":
      return "אמור היה להתקבל";
    case "refund-fold":
      return "זיכויים";
    case "expected":
    default:
      return "צפוי";
  }
}
function toneColor(t: Tone): string {
  if (t === "safe") return "var(--aurora-state-safe)";
  if (t === "watch") return "var(--aurora-state-watch)";
  return "var(--aurora-brand-aurora-2)";
}

export function AuroraIncomeCenter() {
  const data = useAuroraIncome();
  const [openId, setOpenId] = useState<string | null>(null);

  if (!data.ready) return null;
  if (data.rows.length === 0) {
    return (
      <GlassCard elevation="elev-1" padding="spacious" radius="hero">
        <Eyebrow srHeading={{ level: 3, text: "מרכז הכנסות" }}>
          מרכז הכנסות ומשכורות
        </Eyebrow>
        <p className="aurora-body aurora-ink-3 aurora-card-foot">
          עדיין לא הוגדרו הכנסות חוזרות. הוסף הכנסה בהגדרות כדי לראות חיזוי משכורות וצבירת הכנסה.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard elevation="elev-1" padding="spacious" radius="hero">
      <Header data={data} />
      <CountdownCard data={data} />
      <SummaryGrid data={data} />
      <ul className="aurora-income-list">
        {data.rows.map((row) => (
          <IncomeRowView
            key={row.id}
            row={row}
            open={openId === row.id}
            onToggle={() => setOpenId((p) => (p === row.id ? null : row.id))}
          />
        ))}
      </ul>
      <CalendarStrip data={data} />
    </GlassCard>
  );
}

function Header({ data }: { data: AuroraIncomeData }) {
  return (
    <div className="aurora-card-row-top">
      <Eyebrow srHeading={{ level: 3, text: "מרכז הכנסות ומשכורות" }}>
        מרכז הכנסות ומשכורות · {data.monthLabel}
      </Eyebrow>
      <span dir="ltr" className="aurora-income-sum">
        {ILS.format(data.monthlyTotal)}
      </span>
    </div>
  );
}

function CountdownCard({ data }: { data: AuroraIncomeData }) {
  if (!data.nextDepositISO) {
    return (
      <div className="aurora-income-countdown" data-aurora-tone="quiet">
        <Eyebrow>הפקדה הבאה</Eyebrow>
        <p className="aurora-body aurora-ink-3">
          אין הפקדות מתוזמנות שטרם הגיעו החודש.
        </p>
      </div>
    );
  }
  const days = data.nextDepositInDays;
  const when =
    days === 0 ? "היום" : days === 1 ? "מחר" : `בעוד ${days} ימים`;
  return (
    <div className="aurora-income-countdown" data-aurora-tone="safe">
      <div className="aurora-income-countdown-head">
        <Eyebrow>הפקדה הבאה · {data.nextDepositLabel ?? ""}</Eyebrow>
        <span className="aurora-income-countdown-when">{when}</span>
      </div>
      <span dir="ltr" className="aurora-income-countdown-amount">
        <DigitOdometer value={ILS.format(data.nextDepositAmount)} />
      </span>
      <span className="aurora-body aurora-ink-3">
        {DATE_FMT.format(new Date(data.nextDepositISO))}
      </span>
    </div>
  );
}

function SummaryGrid({ data }: { data: AuroraIncomeData }) {
  return (
    <div className="aurora-income-summary-grid">
      <SummaryCell
        eyebrow="הכנסה צפויה"
        amount={data.monthlyTotal}
        hint={`${data.activeCount} מקורות פעילים`}
      />
      <SummaryCell
        eyebrow="בסיס חודשי"
        amount={data.baselineMonthly}
        hint="לפני התאמות פר-חודש"
        accent="var(--aurora-ink-2)"
      />
      <SummaryCell
        eyebrow="ממוצע 5 חודשים"
        amount={data.past6Total > 0 ? Math.round(data.past6Total / 5) : 0}
        hint="היסטוריה ידועה"
        accent="var(--aurora-state-safe)"
      />
    </div>
  );
}

function SummaryCell({
  eyebrow,
  amount,
  hint,
  accent,
}: {
  eyebrow: string;
  amount: number;
  hint: string;
  accent?: string;
}) {
  return (
    <div className="aurora-income-summary-cell">
      <Eyebrow>{eyebrow}</Eyebrow>
      <span
        dir="ltr"
        className="aurora-income-summary-amount"
        style={{ color: accent ?? "var(--aurora-ink-1)" }}
      >
        {ILS.format(amount)}
      </span>
      <span className="aurora-income-summary-hint">{hint}</span>
    </div>
  );
}

function IncomeRowView({
  row,
  open,
  onToggle,
}: {
  row: AuroraIncomeRow;
  open: boolean;
  onToggle: () => void;
}) {
  const reduced = useReducedMotion();
  const tone = statusTone(row.status);
  const tint = toneColor(tone);

  return (
    <li className="aurora-income-li">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="aurora-income-button"
        style={{ borderColor: `${tint}55` }}
      >
        <span
          aria-hidden
          className="aurora-income-chip"
          style={{ background: `${tint}1f`, color: tint }}
        >
          {row.isRefund ? <RefundGlyph /> : <BankGlyph />}
        </span>
        <div className="aurora-income-body">
          <div className="aurora-income-head">
            <span className="aurora-income-title">{row.label}</span>
            <span
              className="aurora-income-status-pill"
              style={{ color: tint, borderColor: `${tint}55` }}
            >
              {statusLabel(row.status)}
            </span>
          </div>
          <div className="aurora-income-headline">
            <span className="aurora-income-amount" dir="ltr">
              <DigitOdometer value={ILS.format(row.amount)} />
            </span>
            {row.share > 0 ? (
              <span className="aurora-income-share">
                {PCT.format(row.share)} מהחודש
              </span>
            ) : null}
          </div>
          <div className="aurora-income-pills">
            {row.dayOfMonth ? (
              <span className="aurora-income-pill">יום {row.dayOfMonth}</span>
            ) : null}
            {row.isVariable ? (
              <span className="aurora-income-pill">משתנה</span>
            ) : null}
            {row.hasOverrideThisMonth ? (
              <span className="aurora-income-pill">
                עודכן ידנית · בסיס {ILS.format(row.baselineAmount)}
              </span>
            ) : null}
            {row.daysUntilNext > 0 ? (
              <span className="aurora-income-pill">
                בעוד {row.daysUntilNext} ימים
              </span>
            ) : null}
          </div>
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
            className="aurora-income-detail"
            initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: reduced ? 0.12 : 0.3, ease: [0.32, 0.72, 0, 1] }}
          >
            <IncomeDetail row={row} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

function IncomeDetail({ row }: { row: AuroraIncomeRow }) {
  return (
    <div className="aurora-income-detail-stack">
      <div className="aurora-income-grid">
        <Cell eyebrow="הסכום החודש" value={ILS.format(row.amount)} accent="var(--aurora-ink-1)" />
        <Cell
          eyebrow="בסיס חוזר"
          value={ILS.format(row.baselineAmount)}
          accent="var(--aurora-ink-2)"
          hint={
            row.hasOverrideThisMonth
              ? "עודכן ידנית בחודש זה"
              : undefined
          }
        />
        <Cell
          eyebrow="הפקדה הבאה"
          value={
            row.nextChargeISO
              ? DATE_FMT.format(new Date(row.nextChargeISO))
              : "—"
          }
          accent="var(--aurora-state-safe)"
        />
        <Cell
          eyebrow="הפקדה קודמת"
          value={
            row.previousChargeISO
              ? DATE_FMT.format(new Date(row.previousChargeISO))
              : "—"
          }
          accent="var(--aurora-ink-2)"
        />
      </div>

      <ContributionMeter share={row.share} />

      {row.trend.length > 0 ? (
        <TrendChart trend={row.trend} />
      ) : null}

      <p className="aurora-body aurora-ink-3">
        {row.isRefund
          ? "זיכויים מתקפלים אוטומטית לסך ההכנסה החודשית עד שהמשתמש מסמן אחרת."
          : row.isVariable
            ? "הכנסה משתנה: Pulse משתמש בערך החודשי המעודכן ולא בבסיס. מומלץ לעדכן את הסכום החודשי כשהוא מגיע."
            : "הכנסה קבועה. מנוע התחזית מוסיף אותה אוטומטית לציר הזמן ולחיזוי סוף החודש."}
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
    <div className="aurora-income-cell">
      <span className="aurora-income-cell-eyebrow">{eyebrow}</span>
      <span dir="ltr" className="aurora-income-cell-value" style={{ color: accent }}>
        {value}
      </span>
      {hint ? <span className="aurora-income-cell-hint">{hint}</span> : null}
    </div>
  );
}

function ContributionMeter({ share }: { share: number }) {
  const pct = Math.max(0, Math.min(1, share));
  const reduced = useReducedMotion();
  return (
    <div className="aurora-income-contribution">
      <Eyebrow>תרומה לתזרים החודשי</Eyebrow>
      <div className="aurora-income-contribution-bar" aria-hidden>
        <motion.span
          className="aurora-income-contribution-fill"
          initial={reduced ? { width: `${pct * 100}%` } : { width: 0 }}
          animate={{ width: `${pct * 100}%` }}
          transition={{ duration: reduced ? 0.12 : 0.7, ease: [0.32, 0.72, 0, 1] }}
        />
      </div>
      <span className="aurora-income-contribution-pct">{PCT.format(pct)}</span>
    </div>
  );
}

function TrendChart({ trend }: { trend: number[] }) {
  const reduced = useReducedMotion();
  const max = Math.max(1, ...trend);
  return (
    <div>
      <Eyebrow>היסטוריה · 6 חודשים</Eyebrow>
      <div className="aurora-income-trend">
        {trend.map((value, i) => {
          const ratio = max > 0 ? value / max : 0;
          const last = i === trend.length - 1;
          return (
            <div key={i} className="aurora-income-trend-col">
              <div className="aurora-income-trend-bar-wrap">
                <motion.span
                  className="aurora-income-trend-bar"
                  data-aurora-active={last ? "true" : "false"}
                  initial={reduced ? { height: `${ratio * 100}%` } : { height: 0 }}
                  animate={{ height: `${ratio * 100}%` }}
                  transition={{
                    duration: reduced ? 0.12 : 0.5,
                    delay: reduced ? 0 : i * 0.05,
                    ease: [0.32, 0.72, 0, 1],
                  }}
                />
              </div>
              <span className="aurora-income-trend-label">
                {TREND_LABELS[i] ?? ""}
              </span>
              <span dir="ltr" className="aurora-income-trend-amount">
                {value > 0 ? ILS.format(value) : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalendarStrip({ data }: { data: AuroraIncomeData }) {
  const upcoming = data.rows
    .filter((r) => r.nextChargeISO)
    .map((r) => ({
      label: r.label,
      whenISO: r.nextChargeISO!,
      amount: r.amount,
      days: r.daysUntilNext,
    }))
    .sort((a, b) => a.days - b.days)
    .slice(0, 5);
  if (upcoming.length === 0) return null;
  return (
    <section className="aurora-income-calendar">
      <Eyebrow>לוח הפקדות קרוב</Eyebrow>
      <ul className="aurora-income-calendar-list">
        {upcoming.map((u, i) => (
          <li key={`${u.whenISO}-${i}`}>
            <span className="aurora-income-calendar-date">
              {DATE_FMT.format(new Date(u.whenISO))}
            </span>
            <span className="aurora-income-calendar-label">{u.label}</span>
            <span dir="ltr" className="aurora-income-calendar-amount">
              +{ILS.format(u.amount)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BankGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden fill="none">
      <path
        d="M2 9l9-5 9 5M4 9v8h14V9M9 17v-5M13 17v-5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RefundGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden fill="none">
      <path
        d="M5 12a6 6 0 1011-3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M14 4l3 5h-5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
