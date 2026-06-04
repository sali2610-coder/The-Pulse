"use client";

// Phase 336 — payment-date picker for the manual-entry sheet.
//
// Compact calendar surfaced inline under the amount row. Lets the
// user back-date a charge they forgot to log in real time (so the
// entry attaches to the day it actually happened — Pulse / heatmap /
// recent activity / daily budget all bucket it correctly).
//
// Scope rules (per user spec):
//   - Default = today.
//   - Current calendar month only. No month navigation.
//   - Past days inside this month are tappable.
//   - Today is tappable.
//   - Future days are disabled (manual entry records actual events,
//     not planned ones).

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, Check, ChevronDown } from "lucide-react";

import { tap as hapticTap } from "@/lib/haptics";

const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
});

const WEEKDAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
const MONTH_LABEL = new Intl.DateTimeFormat("he-IL", {
  month: "long",
  year: "numeric",
});

// Phase 355 — preserve real time-of-day. The picked day is anchored
// at the current local hh:mm:ss instead of a flat 12:00, so an entry
// recorded at 21:30 keeps that time even when the user backdates the
// calendar day. iPhone clock = Asia/Jerusalem in the field; SSR-time
// is irrelevant because this component is "use client".
function occurrenceFromDate(d: Date): Date {
  const now = new Date();
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    0,
  );
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function isoFromDate(d: Date): string {
  return occurrenceFromDate(d).toISOString();
}

function parseISOLocal(iso: string | undefined): Date {
  if (!iso) return occurrenceFromDate(new Date());
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return occurrenceFromDate(new Date());
  return d;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function PaymentDatePicker({
  value,
  onChange,
  /** When true the field renders read-only with the lock copy. Used
   *  by Wallet / SMS auto-ingestion surfaces. */
  locked = false,
  lockedNote,
}: {
  value: string | undefined;
  onChange: (iso: string) => void;
  locked?: boolean;
  lockedNote?: string;
}) {
  const [open, setOpen] = useState(false);
  const today = startOfDay(new Date());
  const selected = parseISOLocal(value);

  const grid = useMemo(() => {
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastOfMonth = new Date(
      today.getFullYear(),
      today.getMonth() + 1,
      0,
    );
    const startWeekday = firstOfMonth.getDay();
    const days: Array<Date | null> = [];
    for (let i = 0; i < startWeekday; i++) days.push(null);
    for (let d = 1; d <= lastOfMonth.getDate(); d++) {
      days.push(new Date(today.getFullYear(), today.getMonth(), d, 12, 0, 0));
    }
    return days;
  }, [today]);

  const label = sameDay(selected, today)
    ? `נרשם להיום · ${DAY_FMT.format(selected)}`
    : `נרשם ל-${DAY_FMT.format(selected)}`;

  if (locked) {
    return (
      <div
        className="flex flex-col gap-1 rounded-2xl border border-white/8 bg-black/25 p-3"
        aria-label="תאריך תשלום נעול"
      >
        <span className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          <CalendarDays className="size-3 text-[color:var(--neon)]" />
          תאריך תשלום
        </span>
        <span
          data-mono="true"
          dir="ltr"
          className="text-[14px] font-medium text-foreground"
        >
          {DAY_FMT.format(today)} · היום
        </span>
        {lockedNote ? (
          <span className="text-[10.5px] text-muted-foreground/85">
            {lockedNote}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-white/8 bg-black/25 p-3">
      <button
        type="button"
        onClick={() => {
          hapticTap();
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-controls="payment-date-grid"
        className="flex w-full items-center justify-between gap-2 text-start"
      >
        <span className="flex flex-col leading-tight">
          <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            <CalendarDays className="size-3 text-[color:var(--neon)]" />
            תאריך תשלום
          </span>
          <span
            data-mono="true"
            dir="ltr"
            className="text-[14px] font-medium text-foreground"
          >
            {label}
          </span>
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
          className="text-muted-foreground"
        >
          <ChevronDown className="size-4" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id="payment-date-grid"
            key="grid"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 pt-1">
              <header className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{MONTH_LABEL.format(today)}</span>
                <span className="text-[10px] text-muted-foreground/70">
                  עבר בלבד · החודש הזה
                </span>
              </header>
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground/70">
                {WEEKDAYS.map((w) => (
                  <span key={w}>{w}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1" role="grid">
                {grid.map((d, idx) => {
                  if (!d) {
                    return <span key={`pad-${idx}`} aria-hidden />;
                  }
                  const isFuture = d.getTime() > today.getTime();
                  const isToday = sameDay(d, today);
                  const isSelected = sameDay(d, selected);
                  const dayNum = d.getDate();
                  return (
                    <button
                      key={d.toISOString()}
                      type="button"
                      disabled={isFuture}
                      onClick={() => {
                        hapticTap();
                        onChange(isoFromDate(d));
                        setOpen(false);
                      }}
                      aria-label={`בחר ${dayNum}`}
                      aria-pressed={isSelected}
                      className={`flex aspect-square items-center justify-center rounded-xl text-[12px] font-medium transition-colors ${
                        isFuture
                          ? "text-muted-foreground/30"
                          : isSelected
                            ? "bg-[color:var(--neon)]/20 text-[color:var(--neon)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--neon)_55%,transparent)]"
                            : isToday
                              ? "border border-[color:var(--neon)]/40 text-foreground"
                              : "border border-white/8 text-foreground/85 hover:border-white/16"
                      }`}
                    >
                      {isSelected ? <Check className="size-3.5" /> : dayNum}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
