"use client";

// Phase 306 — compact-by-default activity preview + full-feed sheet.
//
// Home keeps only a 3-row preview + a "N החודש · M היום" summary
// chip. Tapping the preview opens a premium full-feed bottom sheet
// with filter chips, day-grouped rows and tap-to-edit per item.
// Engine / data unchanged; this is a pure UX restructure of the
// existing sliceForMonth + incomes loop that recent-activity already
// consumed.

import { useEffect, useMemo, useState } from "react";
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
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { ExpenseEditSheet } from "@/components/dashboard/expense-edit-sheet";
import { tap } from "@/lib/haptics";
import type { ExpenseEntry } from "@/types/finance";

import { formatCurrencyAmount } from "@/lib/money";

const ILS = {
  // Phase 341 — preserve agorot. The wrapped format() returns
  // "350 ₪" for integer amounts and "59.90 ₪" when there's a
  // fractional part, so the activity log never silently rounds a
  // small purchase up.
  format: (v: number) => formatCurrencyAmount(v),
};

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

// Phase 321 — relative-time chip. Shows "עכשיו" (< 1 min), "לפני N
// דק'" (< 60 min), "לפני N שעות" (< 24h, same day). Returns null
// when the entry has no real time-of-day (synthetic future slice or
// income projection from dayOfMonth) — better silent than fake.
function relativeChip(
  date: Date,
  hasTime: boolean,
  now: Date,
): string | null {
  if (!hasTime) return null;
  const diff = now.getTime() - date.getTime();
  if (diff < 0) return null;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "עכשיו";
  if (minutes < 60) return `לפני ${minutes} דק'`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24 && date.getDate() === now.getDate()) {
    return `לפני ${hours} שעות`;
  }
  return null;
}

function timeAgo(date: Date, hasTime: boolean, now: Date = new Date()): string {
  if (!hasTime) {
    const todayKey = startOfDay(now);
    const dayKey = startOfDay(date);
    if (dayKey === todayKey) return "היום";
    if (dayKey === todayKey - 86_400_000) return "אתמול";
    const dd = String(date.getDate()).padStart(2, "0");
    const mo = String(date.getMonth() + 1).padStart(2, "0");
    return `${dd}.${mo}`;
  }
  const diffMs = date.getTime() - now.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (Math.abs(minutes) < 1) return "עכשיו";
  if (Math.abs(minutes) < 60) return TIME_FMT.format(minutes, "minute");
  const hours = Math.round(diffMs / 3_600_000);
  if (Math.abs(hours) < 24) return TIME_FMT.format(hours, "hour");
  return HOUR_FMT.format(date);
}

// Phase 314 — richer per-row label: "היום · HH:mm" / "אתמול · HH:mm"
// / "DD.MM · HH:mm" so the user reads when each activity actually
// happened.
//
// Phase 321 — if the entry has no real time-of-day (synthetic future
// installment slice or income projection from dayOfMonth), suppress
// the HH:mm half. "היום · 00:00" reads like a bug; date-only is
// honest about what we know.
function whenLabel(
  date: Date,
  hasTime: boolean,
  now: Date = new Date(),
): string {
  const todayKey = startOfDay(now);
  const dayKey = startOfDay(date);
  const hh = HOUR_FMT.format(date);
  if (dayKey === todayKey) return hasTime ? `היום · ${hh}` : "היום";
  if (dayKey === todayKey - 86_400_000) {
    return hasTime ? `אתמול · ${hh}` : "אתמול";
  }
  const dd = String(date.getDate()).padStart(2, "0");
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  return hasTime ? `${dd}.${mo} · ${hh}` : `${dd}.${mo}`;
}

// Re-render every 30s so the relative chip ages live without
// requiring a store mutation.
function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
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
  entryId?: string;
  direction: Direction;
  amount: number;
  ts: Date;
  /** Phase 321 — true when `ts` carries a real HH:mm:ss (a recorded
   *  charge / refund / wallet event). False for synthetic projected
   *  dates (future installment slices, income projections from
   *  dayOfMonth). Drives label formatting + relative-chip gating. */
  hasRealTime: boolean;
  title: string;
  category?: CategoryId;
  source?: "manual" | "auto" | "sms" | "wallet";
  installments?: number;
  isRefund?: boolean;
  bankPending?: boolean;
  needsConfirmation?: boolean;
  excludeFromBudget?: boolean;
  /** Phase 306 — broad payment source for the filter chips. */
  paySource: "income" | "credit" | "cash" | "bank" | "wallet";
};

type Filter =
  | "all"
  | "today"
  | "week"
  | "out"
  | "in"
  | "credit"
  | "wallet"
  | "pending";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "הכל" },
  { key: "today", label: "היום" },
  { key: "week", label: "השבוע" },
  { key: "out", label: "הוצאות" },
  { key: "in", label: "הכנסות" },
  { key: "credit", label: "אשראי" },
  { key: "wallet", label: "Wallet" },
  { key: "pending", label: "ממתין" },
];

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

function classifyPaySource(
  e: ExpenseEntry,
): ActivityItem["paySource"] {
  if (e.source === "wallet") return "wallet";
  if (e.paymentMethod === "cash") return "cash";
  return "credit";
}

export function RecentActivity() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const incomes = useFinanceStore((s) => s.incomes);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<ExpenseEntry | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  // Phase 321 — live tick so "עכשיו / לפני N דק'" ages without
  // needing a store mutation. 30s cadence is plenty for human reads.
  const now = useNow(30_000);

  const items = useMemo<ActivityItem[]>(() => {
    if (!hydrated) return [];
    const monthKey = currentMonthKey();
    const out: ActivityItem[] = [];

    for (const e of entries) {
      const slice = sliceForMonth(e, monthKey);
      // Phase 314 — Wallet partials / manual entries without a
      // chargeDate previously fell through `sliceForMonth` and
      // disappeared from RecentActivity entirely.
      //
      // Phase 321 — sliceForMonth synthesizes a `new Date(y, m-1, day)`
      // at midnight local time, stripping the real time-of-day. For
      // the FIRST slice (same calendar day as the entry's source
      // timestamp) we re-hydrate the real time from chargeDate /
      // createdAt so "היום · 00:00" never appears. Future slices stay
      // midnight (no real time exists for them) and get hasRealTime
      // false so the UI hides the bogus HH:mm.
      const sourceIso = e.chargeDate ?? e.createdAt;
      let ts: Date;
      let amount: number;
      let hasRealTime = false;
      if (slice) {
        ts = slice.chargeDate;
        if (sourceIso) {
          const src = new Date(sourceIso);
          if (
            !Number.isNaN(src.getTime()) &&
            src.getFullYear() === ts.getFullYear() &&
            src.getMonth() === ts.getMonth() &&
            src.getDate() === ts.getDate()
          ) {
            ts = src;
            hasRealTime = true;
          }
        }
        amount = slice.amount;
      } else {
        if (!sourceIso) continue;
        const d = new Date(sourceIso);
        if (Number.isNaN(d.getTime())) continue;
        ts = d;
        hasRealTime = true;
        amount = Math.abs(e.amount) / Math.max(1, e.installments);
      }
      out.push({
        id: `${e.id}:${ts.toISOString()}`,
        entryId: e.id,
        direction: e.isRefund ? "in" : "out",
        amount,
        ts,
        hasRealTime,
        title: e.merchant ?? e.note ?? getCategory(e.category as CategoryId).label,
        category: e.category as CategoryId,
        source: e.source,
        installments: e.installments,
        isRefund: e.isRefund,
        bankPending: e.bankPending,
        needsConfirmation: e.needsConfirmation,
        excludeFromBudget: e.excludeFromBudget,
        paySource: classifyPaySource(e),
      });
    }

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
        // Income projections come from `dayOfMonth` only — no time.
        hasRealTime: false,
        title: inc.label,
        paySource: "income",
      });
    }

    return out.sort((a, b) => b.ts.getTime() - a.ts.getTime());
  }, [hydrated, entries, incomes]);

  // Summary numbers — same engine inputs.
  // Phase 314 — also surface the latest income + latest expense so
  // the collapsed Home preview reads as "what just happened".
  const summary = useMemo(() => {
    const now = new Date();
    const todayKey = startOfDay(now);
    let monthCount = 0;
    let todayCount = 0;
    let lastIncome: ActivityItem | null = null;
    let lastExpense: ActivityItem | null = null;
    for (const it of items) {
      monthCount++;
      if (startOfDay(it.ts) === todayKey) todayCount++;
      if (it.direction === "in" && !lastIncome) lastIncome = it;
      if (it.direction === "out" && !lastExpense) lastExpense = it;
    }
    return { monthCount, todayCount, lastIncome, lastExpense };
  }, [items]);

  // Filter logic used by the bottom sheet.
  const filtered = useMemo(() => {
    if (filter === "all") return items;
    const now = new Date();
    if (filter === "today") {
      const today = startOfDay(now);
      return items.filter((it) => startOfDay(it.ts) === today);
    }
    if (filter === "week") {
      const cutoff = now.getTime() - 7 * 86_400_000;
      return items.filter((it) => it.ts.getTime() >= cutoff);
    }
    if (filter === "out") return items.filter((it) => it.direction === "out");
    if (filter === "in") return items.filter((it) => it.direction === "in");
    if (filter === "credit")
      return items.filter((it) => it.paySource === "credit");
    if (filter === "wallet")
      return items.filter((it) => it.paySource === "wallet");
    if (filter === "pending")
      return items.filter(
        (it) => it.needsConfirmation || it.bankPending,
      );
    return items;
  }, [items, filter]);

  const grouped = useMemo(() => {
    const byDay = new Map<number, ActivityItem[]>();
    for (const it of filtered) {
      const key = startOfDay(it.ts);
      const list = byDay.get(key) ?? [];
      list.push(it);
      byDay.set(key, list);
    }
    return [...byDay.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([dayTs, list]) => ({ dayTs, items: list }));
  }, [filtered]);

  if (!hydrated) return null;

  function handleRowTap(item: ActivityItem) {
    if (!item.entryId) return;
    const e = entries.find((x) => x.id === item.entryId);
    if (!e) return;
    tap();
    setEditEntry(e);
  }

  return (
    <>
      <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
        <button
          type="button"
          onClick={() => {
            tap();
            setSheetOpen(true);
          }}
          aria-label="פתח פעילות מלאה"
          className="flex w-full items-center justify-between gap-3 rounded-2xl text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60"
        >
          <div className="flex flex-col leading-tight">
            <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              פעילות אחרונה
            </span>
            <span className="text-section text-foreground">
              {summary.monthCount} פעולות החודש · {summary.todayCount} היום
            </span>
          </div>
          <ChevronLeft className="size-4 text-muted-foreground/70" aria-hidden />
        </button>

        {items.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-[12px] text-muted-foreground">
            <Bell className="size-4 shrink-0 text-muted-foreground/60" />
            עוד אין פעילות החודש. חיוב חדש שיתקבל יופיע כאן בזמן אמת.
          </div>
        ) : (
          // Phase 314 — compact "what just happened" preview. Two
          // tiles (income + expense) plus a single CTA. Full list
          // lives inside the bottom sheet.
          <div className="grid grid-cols-2 gap-2">
            <SummaryTile
              direction="in"
              title="הכנסה אחרונה"
              item={summary.lastIncome}
              now={now}
            />
            <SummaryTile
              direction="out"
              title="הוצאה אחרונה"
              item={summary.lastExpense}
              now={now}
            />
            <button
              type="button"
              onClick={() => {
                tap();
                setSheetOpen(true);
              }}
              aria-label="פתח פעילות מלאה"
              className="col-span-2 inline-flex items-center justify-between gap-2 rounded-2xl border border-[color:var(--neon)]/30 bg-[color:var(--neon)]/10 px-3 py-2 text-[12px] font-medium text-[color:var(--neon)] transition-colors hover:border-[color:var(--neon)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60"
            >
              פתח פעילות מלאה
              <ChevronLeft className="size-3.5" aria-hidden />
            </button>
          </div>
        )}
      </section>

      <BottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="פעילות החודש"
      >
        <header className="flex items-center justify-between gap-2 pt-1">
          <span className="text-section text-foreground">פעילות החודש</span>
          <span className="text-caption text-muted-foreground">
            {filtered.length}/{items.length}
          </span>
        </header>

        <div
          className="flex flex-wrap gap-1.5"
          role="radiogroup"
          aria-label="סינון פעילות"
        >
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  tap();
                  setFilter(f.key);
                }}
                className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60 ${
                  active
                    ? "bg-[color:var(--neon)]/20 text-[color:var(--neon)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--neon)_55%,transparent)]"
                    : "border border-white/10 bg-black/30 text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {grouped.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-black/25 p-6 text-center text-caption text-muted-foreground">
            אין פעילות בסינון הזה.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {grouped.map((group) => (
                <li key={group.dayTs} className="flex flex-col gap-1.5">
                  <div className="sticky top-0 z-10 flex items-center gap-2 bg-black/40 px-1 py-1 backdrop-blur-sm">
                    <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground/85">
                      {dayHeader(group.dayTs)}
                    </span>
                    <span className="h-px flex-1 bg-white/6" />
                  </div>
                  {group.items.map((item, idx) => (
                    <ActivityRow
                      key={item.id}
                      item={item}
                      now={now}
                      delay={Math.min(idx * 0.025, 0.2)}
                      onTap={() => handleRowTap(item)}
                    />
                  ))}
                </li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </BottomSheet>

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
  now,
  onTap,
}: {
  item: ActivityItem;
  delay: number;
  now: Date;
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
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-xl"
        style={{
          background: `${accent}22`,
          color: accent,
        }}
      >
        <Icon className="size-4" strokeWidth={1.7} />
      </span>

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
            {whenLabel(item.ts, item.hasRealTime, now)}
          </span>
          {(() => {
            const chip = relativeChip(item.ts, item.hasRealTime, now);
            return chip ? (
              <span
                className="rounded-full bg-[color:var(--neon)]/10 px-1.5 py-0.5 text-[9px] font-medium text-[color:var(--neon)]"
                aria-label={`זמן יחסי: ${chip}`}
              >
                {chip}
              </span>
            ) : null;
          })()}
          {item.installments && item.installments > 1 ? (
            <Pill tone="neutral" icon={<Repeat2 className="size-2.5" />}>
              {item.installments}× תשלומים
            </Pill>
          ) : null}
          {!isIn ? sourcePill(item) : null}
        </div>
      </div>

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

function SummaryTile({
  direction,
  title,
  item,
  now,
}: {
  direction: Direction;
  title: string;
  item: ActivityItem | null;
  now: Date;
}) {
  const accent = direction === "in" ? "#34D399" : "#F87171";
  if (!item) {
    return (
      <div
        className="flex flex-col gap-0.5 rounded-2xl border border-white/8 bg-black/25 p-2.5"
        aria-label={`${title}: אין עדיין`}
      >
        <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </span>
        <span className="text-[11px] text-muted-foreground/70">
          אין עדיין החודש
        </span>
      </div>
    );
  }
  const sign = direction === "in" ? "+" : "−";
  return (
    <div
      className="flex flex-col gap-0.5 rounded-2xl border px-2.5 py-2"
      style={{ borderColor: `${accent}33`, background: `${accent}10` }}
      aria-label={`${title}: ${item.title}`}
    >
      <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </span>
      <span
        data-mono="true"
        dir="ltr"
        className="text-[13px] font-semibold"
        style={{ color: accent }}
      >
        {sign}
        {ILS.format(item.amount)}
      </span>
      <span className="truncate text-[10px] text-foreground/85">
        {item.title}
      </span>
      <span className="text-[9.5px] text-muted-foreground/85">
        {timeAgo(item.ts, item.hasRealTime, now)}
      </span>
    </div>
  );
}
