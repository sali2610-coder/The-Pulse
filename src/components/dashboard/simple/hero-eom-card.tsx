"use client";

// Phase 225 — Simple-mode hero card #2: "מצב סוף חודש צפוי".
//
// One number: where the user's cash position lands at the end of
// the month, after all expected income + remaining card debits +
// loans + recurring fixed costs. Routes through forecastEndOfMonth
// (existing engine) — no new compute.

import { useMemo } from "react";

import { useFinanceStore } from "@/lib/store";
import { forecastEndOfMonth } from "@/lib/forecast";
import { monthKeyOf } from "@/lib/dates";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export function HeroEomCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);

  const report = useMemo(() => {
    if (!hydrated) return null;
    return forecastEndOfMonth({
      accounts,
      loans,
      incomes,
      entries,
      rules,
      statuses,
      monthKey: monthKeyOf(new Date()),
    });
  }, [hydrated, accounts, loans, incomes, entries, rules, statuses]);

  const hasAnchors = accounts.some(
    (a) => a.active && a.kind === "bank" && typeof a.anchorBalance === "number",
  );

  if (!hydrated || !report) return <Skeleton />;

  if (!hasAnchors) {
    return (
      <section className="glass-card flex flex-col gap-2 rounded-3xl p-5">
        <span className="text-[12px] uppercase tracking-[0.22em] text-muted-foreground">
          מצב סוף חודש צפוי
        </span>
        <span className="text-[14px] text-muted-foreground/85">
          חסרה יתרת בנק נוכחית. עבור להגדרות → חשבונות → הוסף יתרה.
        </span>
      </section>
    );
  }

  const value = Math.round(report.forecast);
  const negative = value < 0;
  const tight = !negative && value < 500;
  const tone: "ok" | "warn" | "danger" = negative
    ? "danger"
    : tight
      ? "warn"
      : "ok";
  const color =
    tone === "danger" ? "#F87171" : tone === "warn" ? "#F59E0B" : "#34D399";
  const subtitle = negative
    ? "צפוי להיכנס למינוס לפני המשכורת הבאה"
    : tight
      ? "מצב יציב אבל קרוב לאפס — שמור על הוצאות"
      : "מצב יציב — בקצב הזה צפוי לסיים בעודף";

  return (
    <section
      className="glass-card relative flex flex-col gap-2 overflow-hidden rounded-3xl p-5"
      style={{
        background: `linear-gradient(135deg, ${color}14 0%, transparent 60%)`,
      }}
      aria-label="מצב סוף חודש צפוי"
    >
      <span className="text-[12px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
        מצב סוף חודש צפוי
      </span>
      <span
        data-mono="true"
        dir="ltr"
        className="text-[44px] font-extralight leading-none tracking-tight sm:text-[52px]"
        style={{ color }}
      >
        {value < 0 ? "−" : ""}
        {ILS.format(Math.abs(value))}
      </span>
      <span className="text-[14px] text-muted-foreground">{subtitle}</span>
    </section>
  );
}

function Skeleton() {
  return (
    <section className="glass-card flex flex-col gap-2 rounded-3xl p-5">
      <span className="text-[12px] uppercase tracking-[0.22em] text-muted-foreground">
        מצב סוף חודש צפוי
      </span>
      <span className="h-11 w-44 animate-pulse rounded bg-white/5" />
    </section>
  );
}
