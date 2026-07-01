"use client";

// Phase 445 · AURORA recovery — Banks & Accounts Center
//
// Premium workspace per bank account. UI-only consumer of
// useAuroraBanks. No engine changes; every number is composed from
// existing engine helpers.

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { Eyebrow } from "@/components/aurora/aurora-eyebrow";
import { GlassCard } from "@/components/aurora/aurora-glass-card";
import { DigitOdometer } from "@/components/aurora/aurora-digit-odometer";

import {
  useAuroraBanks,
  type AuroraBankAccount,
  type AuroraBanksData,
} from "./use-aurora-banks";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const DATE_FMT = new Intl.DateTimeFormat("he-IL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function healthTone(h: AuroraBankAccount["health"]): string {
  if (h === "danger") return "var(--aurora-state-danger)";
  if (h === "watch") return "var(--aurora-state-watch)";
  return "var(--aurora-state-safe)";
}
function healthLabel(h: AuroraBankAccount["health"]): string {
  if (h === "danger") return "אזהרת יתרה";
  if (h === "watch") return "שווה מבט";
  return "תקין";
}

export function AuroraBanksCenter() {
  const data = useAuroraBanks();
  const [openId, setOpenId] = useState<string | null>(null);

  if (!data.ready) return null;
  if (data.accounts.length === 0) {
    return (
      <GlassCard elevation="elev-1" padding="spacious" radius="hero">
        <Eyebrow srHeading={{ level: 3, text: "מרכז חשבונות" }}>
          מרכז חשבונות בנק
        </Eyebrow>
        <p className="aurora-body aurora-ink-3 aurora-card-foot">
          עדיין לא הוגדרו חשבונות בנק. הוסף חשבון בהגדרות כדי להפעיל את חיזוי סוף החודש ואת ציר הזמן.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard elevation="elev-1" padding="spacious" radius="hero">
      <Header data={data} />
      <SummaryRow data={data} />
      <ul className="aurora-banks-list">
        {data.accounts.map((acc) => (
          <BankRow
            key={acc.id}
            account={acc}
            data={data}
            open={openId === acc.id}
            onToggle={() => setOpenId((p) => (p === acc.id ? null : acc.id))}
          />
        ))}
      </ul>
    </GlassCard>
  );
}

function Header({ data }: { data: AuroraBanksData }) {
  return (
    <div className="aurora-card-row-top">
      <Eyebrow srHeading={{ level: 3, text: "מרכז חשבונות בנק" }}>
        מרכז חשבונות בנק · {data.monthLabel}
      </Eyebrow>
      <span dir="ltr" className="aurora-banks-sum">
        {ILS.format(data.totalCurrent)}
      </span>
    </div>
  );
}

function SummaryRow({ data }: { data: AuroraBanksData }) {
  return (
    <div className="aurora-banks-summary-grid">
      <SummaryCell
        eyebrow="יתרה כוללת"
        amount={data.totalCurrent}
        accent="var(--aurora-ink-1)"
        hint={`${data.accounts.length} חשבונות פעילים`}
      />
      <SummaryCell
        eyebrow="צפי סוף חודש"
        amount={data.totalProjected}
        accent={
          data.totalProjected < 0
            ? "var(--aurora-state-danger)"
            : "var(--aurora-state-safe)"
        }
        hint="מנוע התחזית של Pulse"
      />
      <SummaryCell
        eyebrow="תזרים החודש"
        amount={data.totalInflow - data.totalOutflow}
        accent={
          data.totalInflow - data.totalOutflow >= 0
            ? "var(--aurora-state-safe)"
            : "var(--aurora-state-watch)"
        }
        hint={`+${ILS.format(data.totalInflow)} · −${ILS.format(data.totalOutflow)}`}
      />
    </div>
  );
}

function SummaryCell({
  eyebrow,
  amount,
  accent,
  hint,
}: {
  eyebrow: string;
  amount: number;
  accent: string;
  hint: string;
}) {
  return (
    <div className="aurora-banks-summary-cell">
      <Eyebrow>{eyebrow}</Eyebrow>
      <span
        dir="ltr"
        className="aurora-banks-summary-amount"
        style={{ color: accent }}
      >
        {amount < 0 ? "−" : ""}
        {ILS.format(Math.abs(amount))}
      </span>
      <span className="aurora-banks-summary-hint">{hint}</span>
    </div>
  );
}

function BankRow({
  account,
  data,
  open,
  onToggle,
}: {
  account: AuroraBankAccount;
  data: AuroraBanksData;
  open: boolean;
  onToggle: () => void;
}) {
  const reduced = useReducedMotion();
  const tint = healthTone(account.health);
  return (
    <li className="aurora-bank-li">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="aurora-bank-button"
        style={{ borderColor: `${tint}55` }}
      >
        <span
          aria-hidden
          className="aurora-bank-chip"
          style={{ background: `${tint}1f`, color: tint }}
        >
          <BankGlyph />
        </span>
        <div className="aurora-bank-body">
          <div className="aurora-bank-head">
            <span className="aurora-bank-title">{account.label}</span>
            <span
              className="aurora-bank-status-pill"
              style={{ color: tint, borderColor: `${tint}55` }}
            >
              {healthLabel(account.health)}
            </span>
          </div>
          <div className="aurora-bank-headline">
            <span
              className="aurora-bank-amount"
              dir="ltr"
              style={{
                color:
                  account.anchorBalance < 0
                    ? "var(--aurora-state-danger)"
                    : "var(--aurora-ink-1)",
              }}
            >
              <DigitOdometer value={ILS.format(account.anchorBalance)} />
            </span>
            <span className="aurora-bank-hint" dir="ltr">
              צפי סוף חודש {ILS.format(account.projectedEom)}
            </span>
          </div>
          <div className="aurora-bank-pills">
            {account.anchorUpdatedAt ? (
              <span className="aurora-bank-pill">
                עודכן לפני {account.anchorAgeDays} ימים
              </span>
            ) : (
              <span className="aurora-bank-pill">עדיין לא עודכן</span>
            )}
            <span className="aurora-bank-pill">
              +{ILS.format(account.monthlyInflow)} החודש
            </span>
            <span className="aurora-bank-pill">
              −{ILS.format(account.monthlyOutflow)} החודש
            </span>
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
            className="aurora-bank-detail"
            initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: reduced ? 0.12 : 0.3, ease: [0.32, 0.72, 0, 1] }}
          >
            <BankDetail account={account} data={data} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

function BankDetail({
  account,
  data,
}: {
  account: AuroraBankAccount;
  data: AuroraBanksData;
}) {
  return (
    <div className="aurora-bank-detail-stack">
      <BalanceHistory history={account.history} />

      <div className="aurora-bank-grid">
        <Cell
          eyebrow="יתרה כעת"
          value={ILS.format(account.anchorBalance)}
          accent={
            account.anchorBalance < 0
              ? "var(--aurora-state-danger)"
              : "var(--aurora-ink-1)"
          }
        />
        <Cell
          eyebrow="צפי סוף חודש"
          value={ILS.format(account.projectedEom)}
          accent={
            account.projectedEom < 0
              ? "var(--aurora-state-danger)"
              : "var(--aurora-state-safe)"
          }
        />
        <Cell
          eyebrow="הכנסות החודש"
          value={`+${ILS.format(account.monthlyInflow)}`}
          accent="var(--aurora-state-safe)"
          hint={`${account.monthlyInflowCount} פעולות`}
        />
        <Cell
          eyebrow="חיובים החודש"
          value={`−${ILS.format(account.monthlyOutflow)}`}
          accent="var(--aurora-state-watch)"
          hint={`${account.monthlyOutflowCount} פעולות`}
        />
        <Cell
          eyebrow="גיל היתרה"
          value={
            account.anchorAgeDays === 999
              ? "—"
              : `${account.anchorAgeDays} ימים`
          }
          accent="var(--aurora-ink-1)"
        />
        <Cell
          eyebrow="מצב"
          value={healthLabel(account.health)}
          accent={healthTone(account.health)}
        />
      </div>

      <DualList
        title="פעילות אחרונה"
        emptyText="אין פעולות אחרונות שמקושרות לחשבון."
        items={account.recentActivity.map((row) => ({
          title: row.label,
          meta: DATE_FMT.format(new Date(row.whenISO)),
          amount: row.amount,
          direction: row.direction,
        }))}
      />

      <DualList
        title="אירועי תזרים קרובים"
        emptyText="אין חיובים או הפקדות מתוזמנים החודש."
        items={account.upcomingEvents.map((row) => ({
          title: row.label,
          meta: DATE_FMT.format(new Date(row.whenISO)),
          amount: row.amount,
          direction: row.direction,
        }))}
      />

      <LinkedGroups data={data} />

      <p className="aurora-body aurora-ink-3">
        {account.health === "danger"
          ? "היתרה שלילית. מנוע התחזית כבר משקלל את החזרים האפשריים בציר הזמן."
          : account.health === "watch"
            ? "היתרה במרחק נשימה ממינוס. כדאי לעדכן ידנית כדי לאמת את ה-anchor."
            : "מצב יציב. Pulse ימשיך לעדכן את החיזוי בכל חיוב חדש."}
      </p>
    </div>
  );
}

function BalanceHistory({ history }: { history: number[] }) {
  const reduced = useReducedMotion();
  if (history.length < 2) {
    return (
      <div className="aurora-bank-history">
        <Eyebrow>היסטוריית יתרה</Eyebrow>
        <p className="aurora-body aurora-ink-3">
          אין מספיק נתונים לציור היסטוריה. הוסף עוד פעולות כדי לבנות את הציר.
        </p>
      </div>
    );
  }
  const max = Math.max(...history);
  const min = Math.min(...history);
  const span = Math.max(1, max - min);
  const points = history
    .map((v, i) => {
      const x = (i / (history.length - 1)) * 100;
      const y = 100 - ((v - min) / span) * 100;
      return `${x},${y}`;
    })
    .join(" ");
  const last = history[history.length - 1];
  return (
    <div className="aurora-bank-history">
      <div className="aurora-bank-history-head">
        <Eyebrow>היסטוריית יתרה · 14 ימים</Eyebrow>
        <span dir="ltr" className="aurora-bank-history-last">
          {last < 0 ? "−" : ""}
          {ILS.format(Math.abs(last))}
        </span>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <motion.polyline
          fill="none"
          stroke="url(#aurora-bank-history-grad)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
          initial={reduced ? { pathLength: 1 } : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: reduced ? 0.12 : 0.9, ease: [0.32, 0.72, 0, 1] }}
        />
        <defs>
          <linearGradient id="aurora-bank-history-grad" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="var(--aurora-brand-aurora-2)" />
            <stop offset="100%" stopColor="var(--aurora-state-safe)" />
          </linearGradient>
        </defs>
      </svg>
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
    <div className="aurora-bank-cell">
      <span className="aurora-bank-cell-eyebrow">{eyebrow}</span>
      <span dir="ltr" className="aurora-bank-cell-value" style={{ color: accent }}>
        {value}
      </span>
      {hint ? <span className="aurora-bank-cell-hint">{hint}</span> : null}
    </div>
  );
}

function DualList({
  title,
  emptyText,
  items,
}: {
  title: string;
  emptyText: string;
  items: Array<{ title: string; meta: string; amount: number; direction: "in" | "out" }>;
}) {
  return (
    <section className="aurora-bank-section">
      <Eyebrow>{title}</Eyebrow>
      {items.length === 0 ? (
        <p className="aurora-body aurora-ink-3">{emptyText}</p>
      ) : (
        <ul className="aurora-bank-mini-list">
          {items.map((it, i) => (
            <li key={`${title}-${i}`}>
              <span
                aria-hidden
                className="aurora-cat-dot"
                style={{
                  background:
                    it.direction === "in"
                      ? "var(--aurora-state-safe)"
                      : "var(--aurora-state-watch)",
                }}
              />
              <div className="aurora-bank-mini-text">
                <span className="aurora-bank-mini-title">{it.title}</span>
                <span className="aurora-bank-mini-meta">{it.meta}</span>
              </div>
              <span
                dir="ltr"
                className="aurora-bank-mini-amount"
                style={{
                  color:
                    it.direction === "in"
                      ? "var(--aurora-state-safe)"
                      : "var(--aurora-ink-1)",
                }}
              >
                {it.direction === "in" ? "+" : "−"}
                {ILS.format(it.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LinkedGroups({ data }: { data: AuroraBanksData }) {
  return (
    <section className="aurora-bank-section">
      <Eyebrow>חיבורים פעילים</Eyebrow>
      <div className="aurora-bank-linked-grid">
        <LinkedColumn title="כרטיסים" empty="אין כרטיסים פעילים.">
          {data.linkedCards.map((c) => (
            <li key={c.id}>
              <span
                aria-hidden
                className="aurora-bank-linked-chip"
                style={{ background: c.color ?? "#7BA9FF" }}
              />
              <div className="aurora-bank-linked-text">
                <span className="aurora-bank-linked-title">{c.label}</span>
                <span dir="ltr" className="aurora-bank-linked-meta">
                  ****{c.cardLast4 ?? "----"}
                </span>
              </div>
            </li>
          ))}
        </LinkedColumn>
        <LinkedColumn title="משכורות" empty="אין הכנסות פעילות.">
          {data.linkedIncomes.map((inc) => (
            <li key={inc.id}>
              <span
                aria-hidden
                className="aurora-bank-linked-chip"
                style={{ background: "var(--aurora-state-safe)" }}
              />
              <div className="aurora-bank-linked-text">
                <span className="aurora-bank-linked-title">{inc.label}</span>
                <span dir="ltr" className="aurora-bank-linked-meta">
                  {ILS.format(inc.amount)}
                  {inc.dayOfMonth ? ` · יום ${inc.dayOfMonth}` : ""}
                </span>
              </div>
            </li>
          ))}
        </LinkedColumn>
        <LinkedColumn title="הלוואות" empty="אין הלוואות פעילות.">
          {data.linkedLoans.map((loan) => (
            <li key={loan.id}>
              <span
                aria-hidden
                className="aurora-bank-linked-chip"
                style={{ background: "var(--aurora-lane-loan)" }}
              />
              <div className="aurora-bank-linked-text">
                <span className="aurora-bank-linked-title">{loan.label}</span>
                <span dir="ltr" className="aurora-bank-linked-meta">
                  {ILS.format(loan.monthlyInstallment)}/חודש
                </span>
              </div>
            </li>
          ))}
        </LinkedColumn>
      </div>
    </section>
  );
}

function LinkedColumn({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const childCount = Array.isArray(children)
    ? children.filter(Boolean).length
    : children
      ? 1
      : 0;
  return (
    <div className="aurora-bank-linked-col">
      <span className="aurora-bank-linked-eyebrow">{title}</span>
      {childCount === 0 ? (
        <span className="aurora-bank-linked-empty">{empty}</span>
      ) : (
        <ul className="aurora-bank-linked-list">{children}</ul>
      )}
    </div>
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
