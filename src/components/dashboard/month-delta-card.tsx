"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Equal } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { monthDelta } from "@/lib/month-delta";
import { currentMonthKey } from "@/lib/dates";
import { getCategory } from "@/lib/categories";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

/**
 * Month-over-month comparator. Renders only when there's at least
 * one prior month with non-zero spend AND the absolute delta clears
 * a ₪200 floor (otherwise the noise isn't worth the real estate).
 *
 * Top-grew row in red, top-shrunk row in green so the eye lands on
 * the budget impact instantly.
 */
export function MonthDeltaCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const delta = useMemo(() => {
    if (!hydrated) return null;
    return monthDelta({ entries, monthKey: currentMonthKey() });
  }, [hydrated, entries]);

  if (!hydrated || !delta) return null;
  if (delta.priorMonthTotal <= 0) return null;
  if (Math.abs(delta.delta) < 200) return null;

  const grew = delta.delta > 0;
  const tone = grew ? "#F87171" : "#34D399";
  const Icon = grew ? ArrowUpRight : ArrowDownRight;
  const pctLabel =
    delta.deltaPct !== null
      ? `${grew ? "+" : ""}${Math.round(delta.deltaPct)}%`
      : "—";

  return (
    <section className="glass-card flex flex-col gap-3 rounded-3xl p-4">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className="flex size-9 items-center justify-center rounded-xl"
            style={{ background: `${tone}22`, color: tone }}
          >
            <Icon className="size-4" strokeWidth={1.8} />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              מה השתנה החודש
            </span>
            <span className="text-[12.5px] font-medium text-foreground">
              {grew ? "הוצאת יותר" : "חסכת"} מול הקודם
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span
            data-mono="true"
            dir="ltr"
            className="text-[15px] font-semibold"
            style={{ color: tone }}
          >
            {grew ? "+" : "−"}
            {ILS.format(Math.abs(delta.delta))}
          </span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
            style={{ background: `${tone}22`, color: tone }}
            dir="ltr"
          >
            {pctLabel}
          </span>
        </div>
      </header>

      <div className="flex items-center gap-3 text-[10.5px] text-muted-foreground">
        <span data-mono="true" dir="ltr">
          {ILS.format(delta.thisMonthTotal)} החודש
        </span>
        <Equal className="size-3" />
        <span data-mono="true" dir="ltr">
          {ILS.format(delta.priorMonthTotal)} בקודם
        </span>
      </div>

      {delta.topGrew.length > 0 || delta.topShrunk.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {delta.topGrew.length > 0 ? (
            <DeltaList title="גדל" rows={delta.topGrew} tone="#F87171" />
          ) : null}
          {delta.topShrunk.length > 0 ? (
            <DeltaList title="ירד" rows={delta.topShrunk} tone="#34D399" />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function DeltaList({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: { category: string; delta: number }[];
  tone: string;
}) {
  return (
    <motion.div
      layout
      className="flex flex-col gap-1 rounded-2xl border border-white/8 bg-black/25 p-2.5"
    >
      <div className="text-[9.5px] uppercase tracking-[0.2em] text-muted-foreground/85">
        {title}
      </div>
      <ul className="flex flex-col gap-1">
        {rows.map((r) => {
          const cat = getCategory(r.category as Parameters<typeof getCategory>[0]);
          const Icon = cat.icon;
          const value = `${r.delta > 0 ? "+" : "−"}${ILS.format(Math.abs(r.delta))}`;
          return (
            <li
              key={r.category}
              className="flex items-center justify-between gap-2"
            >
              <span className="flex items-center gap-1.5">
                <span
                  className="flex size-5 items-center justify-center rounded-md"
                  style={{ background: `${cat.accent}22`, color: cat.accent }}
                >
                  <Icon className="size-3" strokeWidth={1.7} />
                </span>
                <span className="truncate text-[11.5px] text-foreground">
                  {cat.label}
                </span>
              </span>
              <span
                data-mono="true"
                dir="ltr"
                className="text-[11px] font-semibold"
                style={{ color: tone }}
              >
                {value}
              </span>
            </li>
          );
        })}
      </ul>
    </motion.div>
  );
}
