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
import {
  buildEngineCtx,
  getActivityFeed,
  type ActivityFeedRow,
} from "@/lib/financial-engine";
import { Pill } from "@/components/ui/pill";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { ExpenseEditFullScreen } from "@/components/expense-form/expense-edit-fullscreen";
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
  /** Phase 348 — "withdrawal" entries render with their own badge
   *  + a gold accent instead of the standard red expense color. */
  isWithdrawal?: boolean;
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

// Phase 394 — paySource classification moved into FinancialEngine
// (getActivityFeed). RecentActivity is no longer responsible for
// inferring activity classification from raw entry fields.

export function RecentActivity() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const accounts = useFinanceStore((s) => s.accounts);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  // Phase 407 — KPI totals now derive from the activity feed items
  // themselves (see `summary` useMemo). The previous Phase 406
  // engineMonthSpend pulled getCategoryBreakdown.total, which the
  // canonical isBudgetExpense filter strips withdrawals out of. A
  // ₪1 bank withdrawal appeared in the feed but never in "סך
  // הוצאות החודש" — same data source for the feed and the KPI now.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<ExpenseEntry | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  // Phase 321 — live tick so "עכשיו / לפני N דק'" ages without
  // needing a store mutation. 30s cadence is plenty for human reads.
  const now = useNow(30_000);

  const items = useMemo<ActivityItem[]>(() => {
    if (!hydrated) return [];
    // Phase 394 — every row comes from FinancialEngine.getActivityFeed.
    // Engine owns slice logic, source-timestamp fallback, refund /
    // withdrawal / pending flags. RecentActivity is now a pure renderer.
    const feed = getActivityFeed(
      buildEngineCtx({
        accounts,
        rules,
        statuses,
        entries,
        loans,
        incomes,
        monthlyBudget,
      }),
    );
    return feed.rows.map((r: ActivityFeedRow) => {
      const ts = new Date(r.whenISO);
      return {
        id: `${r.entryId}:${r.whenISO}`,
        entryId: r.entryId,
        direction: r.direction,
        amount: r.amount,
        ts,
        hasRealTime: r.hasRealTime,
        title: r.title === r.category ? getCategory(r.category).label : r.title,
        category: r.category,
        source: r.source,
        installments: r.installments,
        isRefund: r.isRefund,
        bankPending: r.bankPending,
        needsConfirmation: r.needsConfirmation,
        excludeFromBudget: r.excludeFromBudget,
        isWithdrawal: r.isWithdrawal,
        paySource: r.paySource,
      };
    });
  }, [
    hydrated,
    accounts,
    rules,
    statuses,
    entries,
    loans,
    incomes,
    monthlyBudget,
  ]);

  // Summary numbers — same engine inputs.
  // Phase 314 — also surface the latest income + latest expense so
  // the collapsed Home preview reads as "what just happened".
  const summary = useMemo(() => {
    const now = new Date();
    const todayKey = startOfDay(now);
    let monthCount = 0;
    let todayCount = 0;
    let lastExpense: ActivityItem | null = null;
    let monthSpend = 0;
    let walletCount = 0;
    let manualCount = 0;
    let creditCount = 0;
    let cashCount = 0;
    for (const it of items) {
      monthCount++;
      if (startOfDay(it.ts) === todayKey) todayCount++;
      // Phase 407 — KPI sources match the activity feed itself.
      // monthSpend sums EVERY out-going activity row, including bank
      // withdrawals + manual cash; the user-visible list and the
      // headline number can never diverge again. Refunds + incomes
      // (direction="in") still excluded — KPI measures outflows.
      if (it.direction === "out") {
        monthSpend += it.amount;
        if (!lastExpense) lastExpense = it;
      }
      if (it.source === "wallet") walletCount++;
      else if (it.source === "manual") manualCount++;
      if (it.paySource === "credit") creditCount++;
      else if (it.paySource === "cash") cashCount++;
    }
    return {
      monthCount,
      todayCount,
      monthSpend: Math.round(monthSpend),
      lastExpense,
      walletCount,
      manualCount,
      creditCount,
      cashCount,
    };
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
      <motion.section
        key={summary.monthCount}
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0, scale: [1, 1.012, 1] }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="glass-card flex flex-col gap-3 rounded-3xl p-4"
        dir="rtl"
        aria-label="פעילות החודש"
        data-sally-variant="polish-activity"
      >
        {/* Header + KPI row */}
        <header className="flex items-center justify-between gap-3">
          <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            פעילות החודש
          </span>
        </header>
        <div className="grid grid-cols-2 gap-2">
          <Kpi
            label="סה״כ פעולות"
            value={summary.monthCount.toString()}
            tone="#22D3EE"
          />
          <Kpi
            label="סך הוצאות החודש"
            value={ILS.format(Math.round(summary.monthSpend))}
            tone="#F87171"
          />
        </div>

        {items.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-[12px] text-muted-foreground">
            <Bell className="size-4 shrink-0 text-muted-foreground/60" />
            עוד אין פעילות החודש. חיוב חדש שיתקבל יופיע כאן בזמן אמת.
          </div>
        ) : (
          <>
            {/* Hero — latest expense */}
            {summary.lastExpense ? (
              <LatestExpenseCard item={summary.lastExpense} now={now} />
            ) : null}

            {/* Source chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              <SourceChip
                icon={<Wallet className="size-3" />}
                label="Wallet"
                count={summary.walletCount}
                tone="#75F5FF"
              />
              <SourceChip
                icon={<Sparkles className="size-3" />}
                label="ידני"
                count={summary.manualCount}
                tone="#D4AF37"
              />
              <SourceChip
                icon={<Banknote className="size-3" />}
                label="אשראי"
                count={summary.creditCount}
                tone="#A78BFA"
              />
              <SourceChip
                icon={<Smartphone className="size-3" />}
                label="מזומן"
                count={summary.cashCount}
                tone="#34D399"
              />
            </div>

            {/* Bottom CTA */}
            <motion.button
              type="button"
              onClick={() => {
                tap();
                setSheetOpen(true);
              }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              aria-label={`פתח פירוט: ${summary.monthCount} פעולות החודש`}
              className="inline-flex w-full items-center justify-between gap-2 rounded-2xl border border-[color:var(--neon)]/30 bg-[color:var(--neon)]/10 px-3 py-2.5 text-[13px] font-medium text-[color:var(--neon)] transition-colors hover:border-[color:var(--neon)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60"
            >
              <span>{summary.monthCount} פעולות החודש</span>
              <ChevronLeft className="size-3.5" aria-hidden />
            </motion.button>
          </>
        )}
      </motion.section>

      <BottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="פעילות החודש"
        className="sally-activity-sheet"
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

      <ExpenseEditFullScreen
        key={editEntry?.id ?? "none"}
        open={editEntry !== null}
        onOpenChange={(o) => {
          if (!o) setEditEntry(null);
        }}
        entryId={editEntry?.id ?? null}
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
  // Phase 348 — withdrawal rows render in gold so the user can
   // tell at a glance "moved between accounts" from "spent".
   const accent = isIn
     ? "#34D399"
     : item.isWithdrawal
       ? "#D4AF37"
       : cat?.accent ?? "#F87171";
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
          {item.isWithdrawal ? <Pill tone="gold">משיכה</Pill> : null}
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

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-2xl border border-white/8 bg-white/[0.02] px-3 py-2"
      style={{ boxShadow: `inset 0 0 22px -10px ${tone}55` }}
    >
      <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </span>
      <span
        data-mono="true"
        dir="ltr"
        className="text-[18px] font-light leading-tight"
        style={{ color: "#F6F6F6", textShadow: `0 0 18px ${tone}33` }}
      >
        {value}
      </span>
    </div>
  );
}

function LatestExpenseCard({
  item,
  now,
}: {
  item: ActivityItem;
  now: Date;
}) {
  const meta = item.category ? getCategory(item.category) : null;
  return (
    <motion.div
      key={item.id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32 }}
      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3"
      style={{
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.04) inset, 0 0 28px -16px rgba(247,113,113,0.45)",
      }}
      aria-label={`הוצאה אחרונה: ${item.title}`}
    >
      <span
        aria-hidden
        className="flex size-12 items-center justify-center rounded-2xl"
        style={{
          background: `${meta?.accent ?? "#F87171"}22`,
          color: meta?.accent ?? "#F87171",
        }}
      >
        {meta ? (
          <meta.icon className="size-6" strokeWidth={1.6} />
        ) : (
          <ArrowUpRight className="size-6" />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          הוצאה אחרונה
        </span>
        <span className="line-clamp-1 text-[15px] font-medium text-foreground">
          {item.title}
        </span>
        <span className="text-[10.5px] text-muted-foreground/85">
          {whenLabel(item.ts, item.hasRealTime, now)}
        </span>
      </div>
      <span
        data-mono="true"
        dir="ltr"
        className="shrink-0 text-[20px] font-light"
        style={{
          color: "#F87171",
          textShadow: "0 0 22px rgba(248,113,113,0.35)",
        }}
      >
        −{ILS.format(item.amount)}
      </span>
    </motion.div>
  );
}

function SourceChip({
  icon,
  label,
  count,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  tone: string;
}) {
  if (count === 0) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
      style={{
        color: tone,
        borderColor: `${tone}44`,
        background: `${tone}12`,
      }}
    >
      <span aria-hidden className="inline-flex items-center" style={{ color: tone }}>
        {icon}
      </span>
      {label}
      <span
        data-mono="true"
        dir="ltr"
        className="text-[10.5px] opacity-80"
      >
        {count}
      </span>
    </span>
  );
}
