"use client";

// Daily flow card — the financial timeline. Groups the last N days
// into sections (today / yesterday / this week / earlier) with a
// per-day strip showing spend, inflow, net delta, and a running-
// balance trail when bank anchors exist. Each transaction row taps
// into the TransactionDrilldownSheet (lazy-loaded).
//
// Auto-hides when nothing happened in the window so a fresh install
// doesn't see an empty timeline.

import { useMemo, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { ArrowDownToLine, ArrowUpRight, Clock, Wallet } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { buildDailyTimeline } from "@/lib/daily-timeline";
import { getCategory } from "@/lib/categories";
import { SectionHeader } from "@/components/ui/section-header";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/empty-state";
import { CARD_TAP, listReveal } from "@/lib/motion-tokens";
import { tap } from "@/lib/haptics";
import type { ExpenseEntry } from "@/types/finance";

// Drilldown chunk loads only when the user taps a row.
const TransactionDrilldownSheet = dynamic(
  () =>
    import("@/components/timeline/transaction-drilldown-sheet").then((m) => ({
      default: m.TransactionDrilldownSheet,
    })),
  { ssr: false },
);

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const HOUR_FMT = new Intl.DateTimeFormat("he-IL", {
  hour: "2-digit",
  minute: "2-digit",
});

const SECTION_LABEL: Record<string, string> = {
  today: "היום",
  yesterday: "אתמול",
  this_week: "השבוע",
  earlier: "לפני יותר",
};

const WINDOW_DAYS = 14;

export function DailyFlowCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const accounts = useFinanceStore((s) => s.accounts);

  const [active, setActive] = useState<ExpenseEntry | null>(null);

  const anchor = useMemo(() => {
    let s = 0;
    for (const a of accounts) {
      if (!a.active) continue;
      if (a.kind !== "bank") continue;
      if (typeof a.anchorBalance !== "number") continue;
      s += a.anchorBalance;
    }
    return s;
  }, [accounts]);

  const rows = useMemo(() => {
    if (!hydrated) return [];
    return buildDailyTimeline({
      entries,
      anchorBalance: anchor,
      windowDays: WINDOW_DAYS,
    });
  }, [hydrated, entries, anchor]);

  if (!hydrated) return null;

  // Group rows into named sections, in the same newest-first order
  // buildDailyTimeline returns.
  const sections = groupBySection(rows);

  const totalCount = rows.reduce((acc, r) => acc + r.count, 0);

  return (
    <section className="glass-card flex flex-col gap-3 rounded-3xl p-4">
      <SectionHeader
        icon={<Clock />}
        title="זרימת היום"
        trailing={
          <span className="text-[10px] text-muted-foreground/70" dir="ltr">
            {WINDOW_DAYS} ימים
          </span>
        }
      />

      {totalCount === 0 ? (
        <EmptyState
          icon={<Wallet className="size-4" />}
          title="אין תנועות עדיין"
          description="ברגע שיירשמו חיובים תופיע כאן זרימת יומיים."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {sections.map(({ section, rows: sectionRows }) => (
            <div key={section} className="flex flex-col gap-2">
              {/* Sticky section label — surfaces while scrolling
                  through the timeline so the user always knows
                  which "today/yesterday/week" cluster they're in. */}
              <div className="sticky top-0 z-10 -mx-1 flex items-center gap-2 bg-gradient-to-b from-[color:var(--surface)]/95 to-transparent px-1 py-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground backdrop-blur-sm">
                {SECTION_LABEL[section]}
              </div>
              {sectionRows.map((row, idx) => {
                if (row.count === 0 && row.section !== "today") return null;
                return (
                  <DayBlock
                    key={row.dayKey}
                    index={idx}
                    label={row.label}
                    spend={row.spend}
                    inflow={row.inflow}
                    net={row.net}
                    runningBalance={anchor > 0 ? row.runningBalance : undefined}
                    entries={row.entries}
                    onRowTap={(entry) => {
                      tap();
                      setActive(entry);
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      )}

      <TransactionDrilldownSheet
        entry={active}
        open={active !== null}
        onOpenChange={(o) => {
          if (!o) setActive(null);
        }}
      />
    </section>
  );
}

function DayBlock({
  index,
  label,
  spend,
  inflow,
  net,
  runningBalance,
  entries,
  onRowTap,
}: {
  index: number;
  label: string;
  spend: number;
  inflow: number;
  net: number;
  runningBalance?: number;
  entries: ExpenseEntry[];
  onRowTap: (entry: ExpenseEntry) => void;
}) {
  const maxBar = Math.max(spend, inflow, 1);
  const spendPct = spend > 0 ? (spend / maxBar) * 100 : 0;
  const inflowPct = inflow > 0 ? (inflow / maxBar) * 100 : 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={listReveal(index)}
      className="rounded-2xl border border-white/8 bg-black/25"
    >
      <header className="flex items-center justify-between gap-2 border-b border-white/5 px-3 py-2 text-[11px]">
        <span className="font-medium text-foreground">{label}</span>
        <span
          data-mono="true"
          dir="ltr"
          className="font-medium"
          style={{
            color: net > 0 ? "#34D399" : net < 0 ? "#F87171" : "#A1A1AA",
          }}
        >
          {net > 0 ? "+" : ""}
          {ILS.format(net)}
        </span>
      </header>

      <div className="flex flex-col gap-1 px-3 pt-2">
        <Bar label="הוצאות" amount={spend} pct={spendPct} tone="#F87171" />
        <Bar label="זיכויים" amount={inflow} pct={inflowPct} tone="#34D399" />
      </div>

      {runningBalance !== undefined ? (
        <div
          className="border-t border-white/5 px-3 py-1.5 text-[10px] text-muted-foreground/85"
          dir="ltr"
        >
          יתרה צפויה אחרי היום ·{" "}
          <span data-mono="true" className="text-foreground">
            {ILS.format(runningBalance)}
          </span>
        </div>
      ) : null}

      {entries.length > 0 ? (
        <ul className="border-t border-white/5">
          {entries.map((entry, idx) => (
            <DayRow
              key={entry.id}
              index={idx}
              entry={entry}
              onTap={() => onRowTap(entry)}
            />
          ))}
        </ul>
      ) : (
        <p className="px-3 pb-2 pt-1 text-[10.5px] text-muted-foreground/70">
          אין תנועות ביום זה.
        </p>
      )}
    </motion.section>
  );
}

function Bar({
  label,
  amount,
  pct,
  tone,
}: {
  label: string;
  amount: number;
  pct: number;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
      <span className="w-14 shrink-0">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.45 }}
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${tone}, ${tone}55)` }}
        />
      </div>
      <span
        data-mono="true"
        dir="ltr"
        className="w-16 shrink-0 text-end text-foreground/85"
      >
        {amount > 0 ? ILS.format(amount) : "—"}
      </span>
    </div>
  );
}

function DayRow({
  index,
  entry,
  onTap,
}: {
  index: number;
  entry: ExpenseEntry;
  onTap: () => void;
}) {
  const cat = getCategory(entry.category);
  const slice = entry.amount / Math.max(1, entry.installments);
  const time = HOUR_FMT.format(new Date(entry.chargeDate));
  const label =
    entry.merchant ?? entry.note ?? cat.label;

  // Tonal accent that mirrors the category color but heavily damped
  // so the row stays calm. Used as a left border via inline style so
  // we don't proliferate per-category Tailwind classes.
  const accentStyle: CSSProperties = {
    boxShadow: `inset 2px 0 0 0 ${cat.accent}`,
  };

  return (
    <motion.li
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={listReveal(index)}
      style={accentStyle}
      className="border-b border-white/4 last:border-b-0"
    >
      <motion.button
        type="button"
        whileTap={CARD_TAP}
        onClick={onTap}
        aria-label={`פתח פרטים — ${label}`}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start outline-none transition-colors hover:bg-white/[0.03] focus-visible:bg-white/[0.06]"
      >
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-[12px] font-medium text-foreground">
            {label}
          </span>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span>{cat.label}</span>
            <span>·</span>
            <span dir="ltr">{time}</span>
            {entry.installments > 1 ? (
              <>
                <span>·</span>
                <Pill tone="purple">
                  {entry.installments} ת.
                </Pill>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end leading-tight">
          <span
            data-mono="true"
            dir="ltr"
            className="text-[12.5px] font-medium"
            style={{ color: entry.isRefund ? "#34D399" : undefined }}
          >
            {entry.isRefund ? "+" : ""}
            {ILS.format(slice)}
          </span>
          <span className="flex items-center gap-1 text-[9px] text-muted-foreground/70">
            {entry.isRefund ? (
              <ArrowDownToLine className="size-2.5" />
            ) : (
              <ArrowUpRight className="size-2.5" />
            )}
          </span>
        </div>
      </motion.button>
    </motion.li>
  );
}

function groupBySection(rows: ReturnType<typeof buildDailyTimeline>) {
  const order: ("today" | "yesterday" | "this_week" | "earlier")[] = [
    "today",
    "yesterday",
    "this_week",
    "earlier",
  ];
  const sections = order
    .map((section) => ({
      section,
      rows: rows.filter((r) => r.section === section),
    }))
    .filter((s) => s.rows.length > 0);
  return sections;
}
