"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarClock, ChevronLeft, CreditCard, Repeat2 } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { buildCardPressure } from "@/lib/card-pressure";
import { projectCardCycle } from "@/lib/card-cycle";
import {
  aggregateCardUtilization,
  cardUtilization,
} from "@/lib/card-utilization";
import { detectIncompleteCards } from "@/lib/incomplete-cards";
import { Pill } from "@/components/ui/pill";
import { EASE_OUT_EXPO, STAGGER_TIGHT } from "@/lib/motion-tokens";
import { TransactionsDrilldown } from "@/components/dashboard/transactions-drilldown";
import { navigateToTab } from "@/lib/tab-nav";
import { tap } from "@/lib/haptics";
import type { CardCycleProjection } from "@/lib/card-cycle";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

/**
 * Per-card monthly pressure. Surfaces ONLY when:
 *   • the user has at least one active credit-card account, AND
 *   • at least one card has a non-zero monthly pressure
 *     (linked recurring + installment + card-side entries this month)
 *
 * Otherwise renders null so the dashboard doesn't show a dead "no
 * pressure" rectangle.
 *
 * Each row shows:
 *   • card label + last-4 chip
 *   • total monthly pressure (mono, right-aligned)
 *   • soft breakdown line: recurring / installments / entries
 *   • plans-active count when > 0
 */
export function CardsPressureCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const rules = useFinanceStore((s) => s.rules);
  const entries = useFinanceStore((s) => s.entries);
  const statuses = useFinanceStore((s) => s.statuses);

  const rows = useMemo(() => {
    if (!hydrated) return [];
    return buildCardPressure({
      accounts,
      rules,
      entries,
      statuses,
      monthKey: currentMonthKey(),
      // Phase 216 — route everything through the effective-cash
      // lens. Rules + entries that settle in a future month no
      // longer inflate this month's pressure.
      useEffectiveCashDates: true,
    });
  }, [hydrated, accounts, rules, entries, statuses]);

  const cyclesById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof projectCardCycle>>();
    if (!hydrated) return map;
    for (const row of rows) {
      const projection = projectCardCycle({
        account: row.card,
        entries,
        rules,
        statuses,
      });
      if (projection) map.set(row.card.id, projection);
    }
    return map;
  }, [hydrated, rows, entries, rules, statuses]);

  const aggregate = useMemo(() => {
    if (!hydrated) return null;
    return aggregateCardUtilization({
      accounts,
      projectionsById: cyclesById,
    });
  }, [hydrated, accounts, cyclesById]);

  const incompleteCount = useMemo(() => {
    if (!hydrated) return 0;
    return detectIncompleteCards({ accounts }).length;
  }, [hydrated, accounts]);

  const [drilldown, setDrilldown] = useState<
    | {
        accountId: string;
        label: string;
        cycle?: CardCycleProjection;
      }
    | null
  >(null);

  if (!hydrated) return null;
  const meaningful = rows.filter((r) => r.totalThisMonth > 0);
  if (meaningful.length === 0) return null;

  const aggregatePct = aggregate
    ? Math.min(100, Math.round(aggregate.ratio * 100))
    : 0;
  const aggregateTone = aggregate
    ? aggregate.severity === "alert"
      ? "#F87171"
      : aggregate.severity === "warn"
        ? "#D4AF37"
        : aggregate.severity === "watch"
          ? "#FCD34D"
          : "#34D399"
    : "#A1A1AA";

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <header className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CreditCard className="size-3 text-[color:var(--neon)]" />
          עומס לפי כרטיס
        </span>
        <div className="flex items-center gap-1.5">
          {aggregate ? (
            <span
              className="rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-[0.18em]"
              style={{
                background: `${aggregateTone}22`,
                color: aggregateTone,
              }}
              dir="ltr"
            >
              ניצול {aggregatePct}% · {aggregate.cardCount} כרטיסים
            </span>
          ) : null}
          {incompleteCount > 0 ? (
            <button
              type="button"
              onClick={() => {
                tap();
                navigateToTab("settings", "accounts");
              }}
              className="rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-2 py-0.5 text-[9px] font-semibold tracking-[0.18em] text-[#D4AF37] transition-colors hover:bg-[#D4AF37]/20"
              aria-label={`השלם הגדרות עבור ${incompleteCount} כרטיסים`}
            >
              השלם הגדרות · {incompleteCount}
            </button>
          ) : null}
        </div>
      </header>

      <ul className="flex flex-col gap-2">
        {meaningful.map((row, idx) => {
          const cycle = cyclesById.get(row.card.id);
          const util = cardUtilization({
            account: row.card,
            cycleProjection: cycle ?? undefined,
          });
          const utilPct = util
            ? Math.min(100, Math.round(util.ratio * 100))
            : 0;
          const utilTone =
            util?.severity === "alert"
              ? "#F87171"
              : util?.severity === "warn"
                ? "#D4AF37"
                : util?.severity === "watch"
                  ? "#FCD34D"
                  : "#34D399";
          return (
          <motion.li
            key={row.card.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: idx * STAGGER_TIGHT,
              duration: 0.3,
              ease: EASE_OUT_EXPO,
            }}
            whileTap={{ scale: 0.99 }}
            onClick={() => {
              tap();
              setDrilldown({
                accountId: row.card.id,
                label: row.card.label,
                cycle: cycle ?? undefined,
              });
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                tap();
                setDrilldown({
                  accountId: row.card.id,
                  label: row.card.label,
                  cycle: cycle ?? undefined,
                });
              }
            }}
            className="flex cursor-pointer items-start gap-2.5 rounded-2xl border border-white/8 bg-black/25 p-3 outline-none transition-colors hover:border-white/14 focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[color:var(--neon)]/14 text-[color:var(--neon)]">
              <CreditCard className="size-4" strokeWidth={1.8} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[13px] font-medium text-foreground">
                  {row.card.label}
                </span>
                {row.card.cardLast4 ? (
                  <Pill tone="neutral">····{row.card.cardLast4}</Pill>
                ) : null}
                {row.installmentPlansActive > 0 ? (
                  <Pill
                    tone="purple"
                    icon={<Repeat2 className="size-2.5" />}
                  >
                    {row.installmentPlansActive} פלאנים
                  </Pill>
                ) : null}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px] text-muted-foreground">
                {(() => {
                  const parts: string[] = [];
                  if (row.fixedRecurringThisMonth > 0) {
                    parts.push(`קבועים ${ILS.format(row.fixedRecurringThisMonth)}`);
                  }
                  if (row.variableRecurringThisMonth > 0) {
                    parts.push(
                      `משתנים ${ILS.format(row.variableRecurringThisMonth)}`,
                    );
                  }
                  if (row.installmentThisMonth > 0) {
                    parts.push(`תשלומים ${ILS.format(row.installmentThisMonth)}`);
                  }
                  if (row.entriesThisMonth > 0) {
                    parts.push(`חד-פעמיים ${ILS.format(row.entriesThisMonth)}`);
                  }
                  return parts.map((p, i) => (
                    <span key={i} className="flex items-center gap-1.5">
                      {i > 0 ? <span>·</span> : null}
                      <span>{p}</span>
                    </span>
                  ));
                })()}
              </div>
              {row.remainingFrame !== undefined ? (
                <div
                  className="mt-0.5 text-[10px] text-muted-foreground/85"
                  dir="ltr"
                >
                  <span>נותרו במסגרת </span>
                  <span data-mono="true" style={{ color: "#34D399" }}>
                    {ILS.format(row.remainingFrame)}
                  </span>
                </div>
              ) : null}
              {cycle ? (
                <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground/85">
                  <CalendarClock className="size-2.5 text-gold" />
                  <span>
                    מחזור חיוב נסגר עוד {cycle.daysUntilClose} ימים ·{" "}
                    <span data-mono="true" dir="ltr">
                      {ILS.format(cycle.projectedAmount)}
                    </span>
                  </span>
                </div>
              ) : null}
              {util ? (
                <div className="mt-1.5 flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground/85">
                    <span>ניצול מסגרת</span>
                    <span
                      data-mono="true"
                      dir="ltr"
                      style={{ color: utilTone }}
                    >
                      {utilPct}% · {ILS.format(util.used)} /{" "}
                      {ILS.format(util.limit)}
                    </span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${utilPct}%`,
                        background: `linear-gradient(90deg, ${utilTone}, ${utilTone}66)`,
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1 leading-tight">
              <span
                data-mono="true"
                dir="ltr"
                className="text-[14px] font-semibold text-destructive"
              >
                −{ILS.format(row.totalThisMonth)}
              </span>
              <div className="flex items-center gap-1 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                <span>החודש</span>
                <ChevronLeft className="size-2.5" />
              </div>
            </div>
          </motion.li>
          );
        })}
      </ul>

      <p className="text-[10px] text-muted-foreground/80">
        מחושב מהוצאות קבועות מקושרות לכרטיס + תשלומים + חיובים שכבר נכנסו
        השבוע.
      </p>

      <TransactionsDrilldown
        open={drilldown !== null}
        onOpenChange={(o) => {
          if (!o) setDrilldown(null);
        }}
        title={drilldown ? `${drilldown.label} — מחזור נוכחי` : ""}
        subtitle={
          drilldown?.cycle
            ? `חלון חיוב נסגר עוד ${drilldown.cycle.daysUntilClose} ימים`
            : "כל חיובי הכרטיס החודש"
        }
        filter="all-this-month"
        accountFilter={drilldown?.accountId}
        dateWindow={
          drilldown?.cycle
            ? {
                start: drilldown.cycle.cycleStart,
                end: drilldown.cycle.cycleEnd,
              }
            : undefined
        }
      />
    </section>
  );
}
