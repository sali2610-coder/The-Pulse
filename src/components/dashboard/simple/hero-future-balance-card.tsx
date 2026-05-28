"use client";

// Phase 228 + 241 — Simple-mode hero card: "מצב חשבון בנק בתאריך X".
//
// Answers the consumer question "what will my account look like on
// the Xth?" using the liquidity-curve engine.
//
// Phase 241 added the date-picker preset row:
//   * היום       → offset 0  (a sanity check vs. anchor)
//   * 1 לחודש    → days until the 1st of the next calendar month
//   * 10 לחודש   → days until the 10th of the next calendar month
//   * סוף החודש  → days until the last day of the current month
//   * מותאם      → free numeric input (clamped to window)
// The legacy −7 / +7 controls move under a single "כיוון" row so
// the picker doesn't overflow on small phones.

import { useMemo, useState } from "react";

import { useFinanceStore } from "@/lib/store";
import { liquidityCurve } from "@/lib/liquidity-curve";
import { FutureBalanceExplain } from "@/components/dashboard/simple/future-balance-explain";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function sameDay(a: string, b: Date): boolean {
  const ad = new Date(a);
  return (
    ad.getFullYear() === b.getFullYear() &&
    ad.getMonth() === b.getMonth() &&
    ad.getDate() === b.getDate()
  );
}

/** Days between today (00:00) and a target absolute date, inclusive
 *  of the target day. Negative when the target is in the past. */
function daysBetween(target: Date, now: Date): number {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/** Offset (days from today) to the Xth day of the next/current month
 *  whichever is still in the future. Falls back to next month when
 *  today is already past the target day of the current month. */
function offsetToDayOfMonth(now: Date, day: number): number {
  const thisMonthTarget = new Date(now.getFullYear(), now.getMonth(), day);
  if (thisMonthTarget.getTime() > now.getTime()) {
    return daysBetween(thisMonthTarget, now);
  }
  const nextMonthTarget = new Date(now.getFullYear(), now.getMonth() + 1, day);
  return daysBetween(nextMonthTarget, now);
}

/** Last day of the current month as an offset from today. */
function offsetToEndOfMonth(now: Date): number {
  const eom = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return Math.max(0, daysBetween(eom, now));
}

export function HeroFutureBalanceCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);

  // Compute a 60-day window so the user can slide forward without
  // running off the end of a default 35-day curve.
  const curve = useMemo(() => {
    if (!hydrated) return null;
    return liquidityCurve({
      accounts,
      loans,
      incomes,
      rules,
      statuses,
      entries,
      windowDays: 60,
    });
  }, [hydrated, accounts, loans, incomes, rules, statuses, entries]);

  // Default offset: next salary day inside the window, else +30.
  const defaultOffset = useMemo(() => {
    if (!curve) return 30;
    if (curve.nextSalaryAt) {
      const idx = curve.points.findIndex((p) =>
        sameDay(p.whenISO, new Date(curve.nextSalaryAt!)),
      );
      if (idx > 0) return idx;
    }
    return Math.min(30, curve.points.length - 1);
  }, [curve]);

  const [offset, setOffset] = useState<number | null>(null);
  const activeOffset = offset ?? defaultOffset;

  if (!hydrated || !curve) return <Skeleton />;

  const hasAnchors = accounts.some(
    (a) => a.active && a.kind === "bank" && typeof a.anchorBalance === "number",
  );
  if (!hasAnchors) {
    return (
      <section className="glass-card flex flex-col gap-3 rounded-3xl p-6">
        <span className="text-micro text-muted-foreground">
          איפה הבנק יהיה בתאריך הקרוב
        </span>
        <span className="text-body text-muted-foreground/85">
          חסרה יתרה נוכחית. הגדרות → חשבונות → הוסף יתרת בנק.
        </span>
      </section>
    );
  }

  const minOffset = 1;
  const maxOffset = Math.max(1, curve.points.length - 1);
  const clamped = Math.min(maxOffset, Math.max(minOffset, activeOffset));
  const point = curve.points[clamped];

  // Sum the deltas between today (idx 0) and the chosen date.
  let inflows = 0;
  let outflows = 0;
  for (let i = 1; i <= clamped; i++) {
    for (const ev of curve.points[i].events) {
      if (ev.amount > 0) inflows += ev.amount;
      else outflows += Math.abs(ev.amount);
    }
  }

  const balance = Math.round(point.balance);
  const negative = balance < 0;
  const tight = !negative && balance < 500;
  const tone: "ok" | "warn" | "danger" = negative
    ? "danger"
    : tight
      ? "warn"
      : "ok";
  const color =
    tone === "danger" ? "#F87171" : tone === "warn" ? "#F59E0B" : "#34D399";

  return (
    <section
      className="glass-card relative flex flex-col gap-3 overflow-hidden rounded-3xl p-6"
      style={{
        background: `linear-gradient(135deg, ${color}14 0%, transparent 60%)`,
      }}
      aria-label="איפה הבנק יהיה בתאריך הקרוב"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-micro text-muted-foreground">איפה אהיה בתאריך</span>
        <span className="text-caption text-muted-foreground" dir="rtl">
          {DAY_FMT.format(new Date(point.whenISO))}
        </span>
      </div>

      <span data-mono="true" dir="ltr" className="text-hero" style={{ color }}>
        {negative ? "−" : ""}
        {ILS.format(Math.abs(balance))}
      </span>

      <div className="flex items-center justify-between gap-3 text-caption text-muted-foreground">
        <span>
          הכנסות{" "}
          <span data-mono="true" dir="ltr" className="text-[#34D399]">
            +{ILS.format(Math.round(inflows))}
          </span>
        </span>
        <span>
          יציאות{" "}
          <span data-mono="true" dir="ltr" className="text-[#F87171]">
            −{ILS.format(Math.round(outflows))}
          </span>
        </span>
      </div>

      {/* Phase 241 — preset date row + custom day-of-month. */}
      <DatePicker
        clamped={clamped}
        defaultOffset={defaultOffset}
        minOffset={minOffset}
        maxOffset={maxOffset}
        onPick={(v) => setOffset(v)}
      />

      {/* Phase 240 — transparent math breakdown. Collapsed by default. */}
      <FutureBalanceExplain offset={clamped} />
    </section>
  );
}

function Skeleton() {
  return (
    <section className="glass-card flex flex-col gap-3 rounded-3xl p-6">
      <span className="text-micro text-muted-foreground">
        איפה הבנק יהיה בתאריך הקרוב
      </span>
      <span className="h-14 w-44 animate-pulse rounded bg-white/5" />
    </section>
  );
}

function DatePicker({
  clamped,
  defaultOffset,
  minOffset,
  maxOffset,
  onPick,
}: {
  clamped: number;
  defaultOffset: number;
  minOffset: number;
  maxOffset: number;
  onPick: (offset: number) => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customDay, setCustomDay] = useState<string>("");

  const now = new Date();
  const presets: Array<{ key: string; label: string; offset: number }> = [
    { key: "default", label: "ברירת מחדל", offset: defaultOffset },
    {
      key: "first",
      label: "1 לחודש הבא",
      offset: offsetToDayOfMonth(now, 1),
    },
    {
      key: "tenth",
      label: "10 לחודש הבא",
      offset: offsetToDayOfMonth(now, 10),
    },
    { key: "eom", label: "סוף החודש", offset: offsetToEndOfMonth(now) },
  ];

  function applyCustom() {
    const n = Number(customDay.trim());
    if (!Number.isFinite(n) || n < 1 || n > 31) return;
    const off = offsetToDayOfMonth(now, n);
    if (off < minOffset || off > maxOffset) return;
    onPick(off);
    setCustomOpen(false);
  }

  return (
    <div className="flex flex-col gap-2 pt-1">
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => {
          const active = clamped === p.offset;
          if (p.offset < minOffset || p.offset > maxOffset) return null;
          return (
            <button
              key={p.key}
              type="button"
              data-no-min-tap
              onClick={() => onPick(p.offset)}
              className={`text-caption rounded-full px-3 py-1.5 transition-colors ${
                active
                  ? "bg-[color:var(--neon)]/25 text-[color:var(--neon)]"
                  : "border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          );
        })}
        <button
          type="button"
          data-no-min-tap
          onClick={() => setCustomOpen((v) => !v)}
          className={`text-caption rounded-full px-3 py-1.5 transition-colors ${
            customOpen
              ? "bg-[color:var(--neon)]/25 text-[color:var(--neon)]"
              : "border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"
          }`}
        >
          מותאם
        </button>
      </div>

      {customOpen ? (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 p-2">
          <span className="text-caption text-muted-foreground">
            יום בחודש
          </span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={2}
            value={customDay}
            onChange={(e) =>
              setCustomDay(e.target.value.replace(/\D/g, "").slice(0, 2))
            }
            className="text-body h-10 w-16 rounded-md border border-white/12 bg-background/60 px-2 text-center text-foreground outline-none focus:border-[color:var(--neon)]/60"
            aria-label="יום בחודש"
            dir="ltr"
          />
          <button
            type="button"
            onClick={applyCustom}
            className="tap-44 text-body rounded-md bg-[color:var(--neon)]/20 px-3 py-2 text-[color:var(--neon)] hover:bg-[color:var(--neon)]/30"
          >
            החל
          </button>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onPick(Math.max(minOffset, clamped - 7))}
          disabled={clamped <= minOffset}
          className="tap-44 text-caption flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-muted-foreground hover:bg-white/10 disabled:opacity-40"
          aria-label="הקדם בשבוע"
        >
          −7 ימים
        </button>
        <button
          type="button"
          onClick={() => onPick(Math.min(maxOffset, clamped + 7))}
          disabled={clamped >= maxOffset}
          className="tap-44 text-caption flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-muted-foreground hover:bg-white/10 disabled:opacity-40"
          aria-label="הוסף שבוע"
        >
          +7 ימים
        </button>
      </div>
    </div>
  );
}
