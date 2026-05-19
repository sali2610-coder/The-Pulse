"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Banknote,
  ChevronDown,
  CreditCard,
  Receipt,
  Repeat2,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { buildDailyCashflow, type DailyMovement } from "@/lib/daily-cashflow";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { Pill } from "@/components/ui/pill";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});
const HEADER_FMT = new Intl.DateTimeFormat("he-IL", {
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
});

function ilsSigned(value: number): string {
  if (value === 0) return ILS.format(0);
  const sign = value > 0 ? "+" : "−";
  return `${sign}${ILS.format(Math.abs(value))}`;
}

function eventIcon(kind: DailyMovement["events"][number]["kind"]) {
  switch (kind) {
    case "income":
      return <TrendingUp className="size-3" strokeWidth={1.8} />;
    case "rule":
      return <Receipt className="size-3" strokeWidth={1.8} />;
    case "loan":
      return <Banknote className="size-3" strokeWidth={1.8} />;
    case "card":
      return <CreditCard className="size-3" strokeWidth={1.8} />;
    case "installment":
      return <Repeat2 className="size-3" strokeWidth={1.8} />;
    default:
      return <Sparkles className="size-3" strokeWidth={1.8} />;
  }
}

/** Verb-prefix the event label so the timeline reads like a story. */
function storyLabel(kind: DailyMovement["events"][number]["kind"], label: string): string {
  switch (kind) {
    case "income":
      return `משכורת נכנסה · ${label}`;
    case "loan":
      return `הלוואה חויבה · ${label}`;
    case "rule":
      return `חיוב חוזר · ${label}`;
    case "installment":
      return `תשלום בתשלומים · ${label}`;
    case "card":
      return `חיוב כרטיס · ${label}`;
    default:
      return label;
  }
}

/**
 * Cashflow timeline — last 7 + next 21 days of financial events, with
 * a running balance arc behind them. Replaces the static "future
 * cashflow" copy with a real chronological feed:
 *
 *   • Salary inflows (incomes) tinted green with the up-arrow icon
 *   • Recurring monthly rules (electricity, rent, phone)
 *   • Loan installments
 *   • Card slices (BNPL plans + recurring commitments)
 *
 * Each day card expands on tap to reveal its event list. The running
 * balance number animates between updates via AnimatedCounter so the
 * "money entering / leaving" feel is visible.
 */
export function CashflowTimeline() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const monthKey = currentMonthKey();
  const [expandedDay, setExpandedDay] = useState<number | null>(null);

  const cashflow = useMemo(() => {
    if (!hydrated) return null;
    return buildDailyCashflow({
      accounts,
      loans,
      incomes,
      entries,
      rules,
      statuses,
      monthKey,
    });
  }, [hydrated, accounts, loans, incomes, entries, rules, statuses, monthKey]);

  // Slice to a focused window: today + 14 forward days, but always
  // include at least 3 days back for context.
  const windowDays = useMemo(() => {
    if (!cashflow) return [];
    const todayIdx = cashflow.days.findIndex((d) => d.isToday);
    const start = Math.max(0, todayIdx - 2);
    const end = Math.min(cashflow.days.length, start + 17);
    return cashflow.days.slice(start, end);
  }, [cashflow]);

  if (!hydrated || !cashflow) return null;

  const hasAnyEvent = windowDays.some((d) => d.events.length > 0);
  // Fresh install: show a calm onboarding card instead of an empty rail.
  if (!hasAnyEvent) {
    return (
      <section className="glass-card flex flex-col gap-3 rounded-3xl p-4">
        <header className="flex items-baseline justify-between">
          <div className="flex flex-col text-right">
            <h3 className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              ציר תזרים
            </h3>
            <span className="text-[10px] text-muted-foreground/70">
              עוד אין נתונים — הוסף משכורת והוצאות קבועות
            </span>
          </div>
          <Wallet className="size-4 text-muted-foreground/60" />
        </header>
        <p className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-center text-[12px] leading-relaxed text-muted-foreground">
          הוסף משכורת חודשית והלוואות תחת{" "}
          <span className="text-foreground">הגדרות</span> כדי לראות תזרים יומי
          חי, יתרה רצה, וצפי לסוף חודש.
        </p>
      </section>
    );
  }

  return (
    <section className="glass-card flex flex-col gap-3 rounded-3xl p-4">
      <header className="flex items-baseline justify-between">
        <div className="flex flex-col text-right">
          <h3 className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            ציר תזרים
          </h3>
          <span className="text-[10px] text-muted-foreground/70">
            הכנסות, הוצאות, הלוואות — ביום וביום
          </span>
        </div>
        <div className="flex flex-col items-end leading-tight">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/80">
            צפי סוף חודש
          </span>
          <span
            data-mono="true"
            dir="ltr"
            className={`text-base font-semibold ${
              cashflow.endBalance >= 0 ? "text-[#34D399]" : "text-destructive"
            }`}
          >
            <AnimatedCounter value={cashflow.endBalance} format={ilsSigned} />
          </span>
        </div>
      </header>

      <ul className="flex flex-col gap-1.5">
        {windowDays.map((day) => {
          const isExpanded = expandedDay === day.day;
          const hasEvents = day.events.length > 0;
          return (
            <li key={day.day} className="flex flex-col">
              <button
                type="button"
                onClick={() => {
                  if (!hasEvents) return;
                  setExpandedDay(isExpanded ? null : day.day);
                }}
                className={`flex items-center gap-2.5 rounded-2xl border px-3 py-2 transition-colors ${
                  day.isToday
                    ? "border-[color:var(--neon)]/40 bg-[color:var(--neon)]/6"
                    : hasEvents
                      ? "border-white/8 bg-black/25 hover:border-white/16"
                      : "border-white/4 bg-transparent"
                }`}
                disabled={!hasEvents}
              >
                <span className="flex w-16 shrink-0 flex-col items-start text-right leading-tight">
                  <span
                    className={`text-[11px] font-medium ${
                      day.isToday
                        ? "text-[color:var(--neon)]"
                        : "text-foreground"
                    }`}
                  >
                    {day.isToday ? "היום" : DAY_FMT.format(day.date)}
                  </span>
                  {day.isPast ? (
                    <Pill tone="neutral">עבר</Pill>
                  ) : null}
                </span>

                <div className="flex flex-1 items-center gap-1 overflow-hidden">
                  {hasEvents ? (
                    day.events.slice(0, 3).map((ev, idx) => (
                      <span
                        key={idx}
                        className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                          ev.amount > 0
                            ? "bg-[#34D399]/15 text-[#34D399]"
                            : "bg-destructive/12 text-destructive"
                        }`}
                      >
                        {eventIcon(ev.kind)}
                        {Math.round(Math.abs(ev.amount))}
                      </span>
                    ))
                  ) : (
                    <span className="text-[10px] text-muted-foreground/60">
                      —
                    </span>
                  )}
                  {day.events.length > 3 ? (
                    <span className="text-[9px] text-muted-foreground">
                      +{day.events.length - 3}
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-col items-end leading-tight">
                  <span
                    data-mono="true"
                    dir="ltr"
                    className={`text-[12px] font-semibold ${
                      day.net > 0
                        ? "text-[#34D399]"
                        : day.net < 0
                          ? "text-destructive"
                          : "text-muted-foreground"
                    }`}
                  >
                    {day.net === 0 ? "—" : ilsSigned(day.net)}
                  </span>
                  <span
                    data-mono="true"
                    dir="ltr"
                    className="text-[9px] text-muted-foreground/80"
                  >
                    {ILS.format(day.runningBalance)}
                  </span>
                </div>

                {hasEvents ? (
                  <motion.span
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-muted-foreground/60"
                  >
                    <ChevronDown className="size-3.5" />
                  </motion.span>
                ) : null}
              </button>

              <AnimatePresence initial={false}>
                {isExpanded && hasEvents ? (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-1.5 flex flex-col gap-1 pb-1">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/80">
                        {HEADER_FMT.format(day.date)}
                      </div>
                      {day.events.map((ev, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-2 rounded-xl border border-white/6 bg-black/30 px-3 py-1.5"
                        >
                          <span className="flex items-center gap-1.5">
                            <span
                              className="flex size-6 items-center justify-center rounded-md"
                              style={{
                                background:
                                  ev.amount > 0
                                    ? "rgba(52,211,153,0.15)"
                                    : "rgba(248,113,113,0.12)",
                                color: ev.amount > 0 ? "#34D399" : "#F87171",
                              }}
                            >
                              {eventIcon(ev.kind)}
                            </span>
                            <span className="text-[12px] text-foreground/90">
                              {storyLabel(ev.kind, ev.label)}
                            </span>
                          </span>
                          <span
                            data-mono="true"
                            dir="ltr"
                            className={`text-[12px] font-semibold ${
                              ev.amount > 0
                                ? "text-[#34D399]"
                                : "text-destructive"
                            }`}
                          >
                            {ilsSigned(ev.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>

      <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Wallet className="size-2.5" />
        משכורת מתווספת אוטומטית ביום הגדרתה. יתרה רצה משקפת את כל תזרים החודש.
      </p>
    </section>
  );
}
