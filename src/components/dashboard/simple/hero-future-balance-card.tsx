"use client";

// Phase 228 — Simple-mode hero card: "מצב חשבון בנק בתאריך X".
//
// Directly answers the most common consumer question — "what will
// my bank account look like on the 10th of next month?" — using
// the liquidity-curve engine that already simulates day-by-day
// balance.
//
// Date selection:
//   - Default: the next salary day inside the window (when known).
//   - Otherwise: today + 30 days.
//   - −7 / +7 chips let the user shift the snapshot date without a
//     full date picker, matching the "calm consumer" brief.
//
// Render is one big balance figure + the deltas (inflow / outflow)
// between today and that date. Reuses the existing liquidityCurve
// — no new financial logic.

import { useMemo, useState } from "react";

import { useFinanceStore } from "@/lib/store";
import { liquidityCurve } from "@/lib/liquidity-curve";

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
      <section className="glass-card flex flex-col gap-2 rounded-3xl p-5">
        <span className="text-[12px] uppercase tracking-[0.22em] text-muted-foreground">
          מצב חשבון בנק עתידי
        </span>
        <span className="text-[14px] text-muted-foreground/85">
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
      className="glass-card relative flex flex-col gap-3 overflow-hidden rounded-3xl p-5"
      style={{
        background: `linear-gradient(135deg, ${color}14 0%, transparent 60%)`,
      }}
      aria-label="מצב חשבון בנק עתידי"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
          מצב בנק בתאריך
        </span>
        <span className="text-[12px] text-muted-foreground" dir="rtl">
          {DAY_FMT.format(new Date(point.whenISO))}
        </span>
      </div>

      <span
        data-mono="true"
        dir="ltr"
        className="text-[52px] font-extralight leading-none tracking-tight sm:text-[60px]"
        style={{ color }}
      >
        {negative ? "−" : ""}
        {ILS.format(Math.abs(balance))}
      </span>

      <div className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
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

      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={() => setOffset(Math.max(minOffset, clamped - 7))}
          disabled={clamped <= minOffset}
          className="tap-44 flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-[14px] text-foreground hover:bg-white/10 disabled:opacity-40"
          aria-label="הקדם בשבוע"
        >
          −7 ימים
        </button>
        <button
          type="button"
          onClick={() => setOffset(defaultOffset)}
          className="tap-44 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-[13px] text-muted-foreground hover:bg-white/10"
        >
          ברירת מחדל
        </button>
        <button
          type="button"
          onClick={() => setOffset(Math.min(maxOffset, clamped + 7))}
          disabled={clamped >= maxOffset}
          className="tap-44 flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-[14px] text-foreground hover:bg-white/10 disabled:opacity-40"
          aria-label="הוסף שבוע"
        >
          +7 ימים
        </button>
      </div>
    </section>
  );
}

function Skeleton() {
  return (
    <section className="glass-card flex flex-col gap-2 rounded-3xl p-5">
      <span className="text-[12px] uppercase tracking-[0.22em] text-muted-foreground">
        מצב חשבון בנק עתידי
      </span>
      <span className="h-12 w-44 animate-pulse rounded bg-white/5" />
    </section>
  );
}
