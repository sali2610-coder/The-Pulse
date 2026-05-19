"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Banknote,
  Bell,
  ChevronLeft,
  Repeat2,
  Smartphone,
  Sparkles,
  Wallet,
  Workflow,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { getCategory, type CategoryId } from "@/lib/categories";
import { currentMonthKey } from "@/lib/dates";
import { sliceForMonth } from "@/lib/projections";
import { Pill } from "@/components/ui/pill";
import { TransactionsDrilldown } from "@/components/dashboard/transactions-drilldown";
import { ExpenseEditSheet } from "@/components/dashboard/expense-edit-sheet";
import { tap } from "@/lib/haptics";
import type { ExpenseEntry } from "@/types/finance";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const TIME_FMT = new Intl.RelativeTimeFormat("he-IL", { numeric: "auto" });
const DAY_HEADER_FMT = new Intl.DateTimeFormat("he-IL", {
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
});
const HOUR_FMT = new Intl.DateTimeFormat("he-IL", {
  hour: "2-digit",
  minute: "2-digit",
});

function timeAgo(date: Date, now: Date = new Date()): string {
  const diffMs = date.getTime() - now.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (Math.abs(minutes) < 60) return TIME_FMT.format(minutes, "minute");
  const hours = Math.round(diffMs / 3_600_000);
  if (Math.abs(hours) < 24) return TIME_FMT.format(hours, "hour");
  return HOUR_FMT.format(date);
}

function startOfDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function dayHeader(ts: number, now: Date = new Date()): string {
  const today = startOfDay(now);
  const yesterday = today - 86_400_000;
  if (ts === today) return "היום";
  if (ts === yesterday) return "אתמול";
  const tomorrow = today + 86_400_000;
  if (ts === tomorrow) return "מחר";
  return DAY_HEADER_FMT.format(new Date(ts));
}

type Direction = "in" | "out";
type ActivityItem = {
  id: string;
  /** Linked store entry — undefined for income events (they live in
   *  the incomes table, not entries). Editable activity rows must have
   *  this populated. */
  entryId?: string;
  direction: Direction;
  amount: number;
  ts: Date;
  title: string;
  category?: CategoryId;
  source?: "manual" | "auto" | "sms" | "wallet";
  installments?: number;
  isRefund?: boolean;
  bankPending?: boolean;
  needsConfirmation?: boolean;
  excludeFromBudget?: boolean;
};

function sourcePill(item: ActivityItem) {
  if (item.source === "wallet")
    return (
      <Pill tone="neon" icon={<Wallet className="size-2.5" />}>
        Wallet
      </Pill>
    );
  if (item.source === "sms")
    return (
      <Pill tone="purple" icon={<Smartphone className="size-2.5" />}>
        SMS
      </Pill>
    );
  if (item.source === "auto")
    return (
      <Pill tone="purple" icon={<Workflow className="size-2.5" />}>
        אוטומטי
      </Pill>
    );
  return (
    <Pill tone="neutral" icon={<Sparkles className="size-2.5" />}>
      ידני
    </Pill>
  );
}

export function RecentActivity() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const incomes = useFinanceStore((s) => s.incomes);
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<ExpenseEntry | null>(null);

  const items = useMemo<ActivityItem[]>(() => {
    if (!hydrated) return [];
    const monthKey = currentMonthKey();
    const out: ActivityItem[] = [];

    // Outflow slices for this month.
    for (const e of entries) {
      const slice = sliceForMonth(e, monthKey);
      if (!slice) continue;
      out.push({
        id: `${e.id}:${slice.chargeDate.toISOString()}`,
        entryId: e.id,
        direction: e.isRefund ? "in" : "out",
        amount: slice.amount,
        ts: slice.chargeDate,
        title: e.merchant ?? e.note ?? getCategory(e.category as CategoryId).label,
        category: e.category as CategoryId,
        source: e.source,
        installments: e.installments,
        isRefund: e.isRefund,
        bankPending: e.bankPending,
        needsConfirmation: e.needsConfirmation,
        excludeFromBudget: e.excludeFromBudget,
      });
    }

    // Incomes whose dayOfMonth already passed this month → inflow events.
    const now = new Date();
    const todayDay = now.getDate();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    for (const inc of incomes) {
      if (!inc.active) continue;
      if (inc.dayOfMonth > todayDay) continue;
      const date = new Date(monthStart);
      date.setDate(inc.dayOfMonth);
      out.push({
        id: `income:${inc.id}:${monthKey}`,
        direction: "in",
        amount: inc.amount,
        ts: date,
        title: inc.label,
      });
    }

    return out.sort((a, b) => b.ts.getTime() - a.ts.getTime()).slice(0, 8);
  }, [hydrated, entries, incomes]);

  /** Group activity rows by calendar day so the user sees natural
   *  "היום / אתמול / DD/MM" chapters instead of a flat timeline. */
  const grouped = useMemo(() => {
    const byDay = new Map<number, ActivityItem[]>();
    for (const item of items) {
      const key = startOfDay(item.ts);
      const list = byDay.get(key) ?? [];
      list.push(item);
      byDay.set(key, list);
    }
    return [...byDay.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([dayTs, list]) => ({ dayTs, items: list }));
  }, [items]);

  if (!hydrated) return null;

  if (items.length === 0) {
    return (
      <section className="glass-card rounded-3xl p-4">
        <header className="mb-2 flex items-center justify-between">
          <h3 className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            פעילות אחרונה
          </h3>
        </header>
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-[12px] text-muted-foreground">
          <Bell className="size-4 shrink-0 text-muted-foreground/60" />
          עוד אין פעילות החודש. חיוב חדש שיתקבל יופיע כאן בזמן אמת.
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
        <header className="flex items-center justify-between">
          <h3 className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            פעילות אחרונה
          </h3>
          <button
            type="button"
            onClick={() => setDrilldownOpen(true)}
            className="flex items-center gap-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
          >
            כל החיובים
            <ChevronLeft className="size-3" />
          </button>
        </header>

        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {grouped.map((group) => (
              <li key={group.dayTs} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 px-1 pt-1">
                  <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground/80">
                    {dayHeader(group.dayTs)}
                  </span>
                  <span className="h-px flex-1 bg-white/6" />
                </div>
                {group.items.map((item, idx) => (
                  <ActivityRow
                    key={item.id}
                    item={item}
                    delay={idx * 0.04}
                    onTap={() => {
                      if (!item.entryId) return;
                      const e = entries.find((x) => x.id === item.entryId);
                      if (!e) return;
                      tap();
                      setEditEntry(e);
                    }}
                  />
                ))}
              </li>
            ))}
          </AnimatePresence>
        </ul>
      </section>

      <TransactionsDrilldown
        open={drilldownOpen}
        onOpenChange={setDrilldownOpen}
        title="פעילות החודש"
        subtitle="כל החיובים — עבר ועתיד"
        filter="all-this-month"
      />

      <ExpenseEditSheet
        key={editEntry?.id ?? "none"}
        open={editEntry !== null}
        onOpenChange={(o) => {
          if (!o) setEditEntry(null);
        }}
        entry={editEntry}
      />
    </>
  );
}

function ActivityRow({
  item,
  delay,
  onTap,
}: {
  item: ActivityItem;
  delay: number;
  onTap?: () => void;
}) {
  const tappable = Boolean(item.entryId && onTap);
  const cat = item.category ? getCategory(item.category) : null;
  const isIn = item.direction === "in";
  const accent = isIn ? "#34D399" : cat?.accent ?? "#F87171";
  const sign = isIn ? "+" : "−";
  const Icon = isIn
    ? ArrowDownToLine
    : item.installments && item.installments > 1
      ? Repeat2
      : cat
        ? cat.icon
        : Banknote;

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ delay, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      whileTap={tappable ? { scale: 0.985 } : undefined}
      onClick={tappable ? onTap : undefined}
      role={tappable ? "button" : undefined}
      tabIndex={tappable ? 0 : undefined}
      onKeyDown={
        tappable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onTap?.();
              }
            }
          : undefined
      }
      className={`flex items-center gap-2.5 rounded-2xl border border-white/6 bg-black/30 p-2.5 ${
        tappable
          ? "cursor-pointer outline-none transition-colors hover:border-white/14 focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60"
          : ""
      }`}
    >
      {/* Direction badge */}
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-xl"
        style={{
          background: `${accent}22`,
          color: accent,
        }}
      >
        <Icon className="size-4" strokeWidth={1.7} />
      </span>

      {/* Body */}
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px] font-medium text-foreground">
            {item.title}
          </span>
          {item.needsConfirmation ? (
            <Pill tone="gold">ממתין לאישור</Pill>
          ) : item.bankPending ? (
            <Pill tone="gold">בנק תלוי</Pill>
          ) : null}
          {item.isRefund ? <Pill tone="green">זיכוי</Pill> : null}
          {item.excludeFromBudget ? <Pill tone="gold">חוץ-תקציב</Pill> : null}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground/85">
            {timeAgo(item.ts)}
          </span>
          {item.installments && item.installments > 1 ? (
            <Pill tone="neutral" icon={<Repeat2 className="size-2.5" />}>
              {item.installments}× תשלומים
            </Pill>
          ) : null}
          {!isIn ? sourcePill(item) : null}
        </div>
      </div>

      {/* Amount */}
      <div className="flex shrink-0 flex-col items-end leading-tight">
        <span
          data-mono="true"
          dir="ltr"
          className="text-[13.5px] font-semibold"
          style={{ color: accent }}
        >
          {sign}
          {ILS.format(item.amount)}
        </span>
        {isIn ? (
          <ArrowUpRight className="-mt-0.5 size-2.5 text-[#34D399]" />
        ) : null}
      </div>
    </motion.li>
  );
}
