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

  const preview = items.slice(0, 3);

  return (
    <>
      <motion.section
        key={summary.monthCount}
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        className="mo-card"
        dir="rtl"
        aria-label="פעילות החודש"
      >
        {/* Compact header row: title + count + total on the right,
           small glyph on the far left (RTL flow). */}
        <header className="mo-head">
          <span aria-hidden className="mo-head-glyph">
            <Sparkles className="size-4" strokeWidth={1.6} />
          </span>
          <div className="mo-head-text">
            <span className="mo-head-title">פעילות החודש</span>
            <span className="mo-head-meta">
              <span data-mono="true" dir="ltr">
                {summary.monthCount}
              </span>{" "}
              פעולות
              {summary.monthSpend > 0 ? (
                <>
                  <span aria-hidden> · </span>
                  <span
                    data-mono="true"
                    dir="ltr"
                    className="mo-head-total"
                  >
                    {ILS.format(Math.round(summary.monthSpend))}
                  </span>
                </>
              ) : null}
            </span>
          </div>
        </header>

        {/* Two compact tap-tiles. Tap any → open full detail sheet. */}
        <div className="mo-tiles">
          <MoTile
            label="סה״כ פעולות"
            value={summary.monthCount.toString()}
            hint={`${summary.todayCount} היום`}
            onClick={() => {
              tap();
              setSheetOpen(true);
            }}
          />
          <MoTile
            label="סה״כ הוצאות"
            value={ILS.format(Math.round(summary.monthSpend))}
            hint="החודש"
            emphasize
            onClick={() => {
              tap();
              setSheetOpen(true);
            }}
          />
        </div>

        {items.length === 0 ? (
          <div className="mo-empty">
            <Bell className="size-4 shrink-0" strokeWidth={1.4} />
            עוד אין פעילות החודש. חיוב חדש שיתקבל יופיע כאן בזמן אמת.
          </div>
        ) : (
          <>
            <ul className="mo-preview">
              {preview.map((item, idx) => (
                <MoPreviewRow
                  key={item.id}
                  item={item}
                  now={now}
                  delay={idx * 0.04}
                  onTap={() => handleRowTap(item)}
                />
              ))}
            </ul>

            <motion.button
              type="button"
              onClick={() => {
                tap();
                setSheetOpen(true);
              }}
              whileTap={{ scale: 0.985 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              aria-label={`פתח פירוט מלא של ${summary.monthCount} פעולות החודש`}
              className="mo-open"
            >
              <span className="mo-open-label">פתח פירוט מלא</span>
              <span aria-hidden className="mo-open-chevron">
                <ChevronLeft className="size-4" strokeWidth={1.9} />
              </span>
            </motion.button>
          </>
        )}
      </motion.section>

      <BottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="פעילות החודש"
        className="mo-sheet"
      >
        <header className="mo-sheet-hero">
          <div className="mo-sheet-hero-left">
            <span className="mo-sheet-hero-eyebrow">חודש נוכחי</span>
            <span className="mo-sheet-hero-title">פעילות החודש</span>
          </div>
          <div className="mo-sheet-hero-right">
            <span className="mo-sheet-hero-count" data-mono="true" dir="ltr">
              {filtered.length}
              <span className="mo-sheet-hero-count-total">/{items.length}</span>
            </span>
            <span className="mo-sheet-hero-spend" data-mono="true" dir="ltr">
              {ILS.format(Math.round(summary.monthSpend))}
            </span>
          </div>
        </header>

        <div
          className="mo-sheet-filters"
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
                className="mo-sheet-filter"
                data-active={active ? "true" : undefined}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {grouped.length === 0 ? (
          <div className="mo-sheet-empty">אין פעילות בסינון הזה.</div>
        ) : (
          <ul className="mo-sheet-list">
            <AnimatePresence initial={false}>
              {grouped.map((group) => (
                <li key={group.dayTs} className="mo-sheet-day">
                  <div className="mo-sheet-day-header">
                    <span className="mo-sheet-day-label">
                      {dayHeader(group.dayTs)}
                    </span>
                    <span className="mo-sheet-day-rule" aria-hidden />
                    <span
                      className="mo-sheet-day-count"
                      data-mono="true"
                      dir="ltr"
                    >
                      {group.items.length}
                    </span>
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
      className="mo-row"
      data-tappable={tappable ? "true" : undefined}
      data-direction={isIn ? "in" : "out"}
      style={{ "--mo-row-accent": accent } as React.CSSProperties}
    >
      <span aria-hidden className="mo-row-rail" />
      <span className="mo-row-icon">
        <Icon className="size-4" strokeWidth={1.7} />
      </span>

      <div className="mo-row-body">
        <div className="mo-row-line1">
          <span className="mo-row-title">{item.title}</span>
          {item.needsConfirmation ? (
            <Pill tone="gold">ממתין לאישור</Pill>
          ) : item.bankPending ? (
            <Pill tone="gold">בנק תלוי</Pill>
          ) : null}
          {item.isRefund ? <Pill tone="green">זיכוי</Pill> : null}
          {item.isWithdrawal ? <Pill tone="gold">משיכה</Pill> : null}
          {item.excludeFromBudget ? <Pill tone="gold">חוץ-תקציב</Pill> : null}
        </div>
        <div className="mo-row-line2">
          <span className="mo-row-when">
            {whenLabel(item.ts, item.hasRealTime, now)}
          </span>
          {(() => {
            const chip = relativeChip(item.ts, item.hasRealTime, now);
            return chip ? (
              <span
                className="mo-row-chip"
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

      <div className="mo-row-amount-wrap">
        <span className="mo-row-amount" data-mono="true" dir="ltr">
          {sign}
          {ILS.format(item.amount)}
        </span>
        {isIn ? (
          <ArrowUpRight className="mo-row-amount-arrow" aria-hidden />
        ) : null}
      </div>
    </motion.li>
  );
}

function MoTile({
  label,
  value,
  hint,
  emphasize,
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasize?: boolean;
  onClick?: () => void;
}) {
  return (
    <motion.button
      type="button"
      className="mo-tile"
      data-emphasize={emphasize ? "true" : undefined}
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
      aria-label={`${label} · ${value}`}
    >
      <span className="mo-tile-label">{label}</span>
      <span className="mo-tile-value" data-mono="true" dir="ltr">
        {value}
      </span>
      {hint ? <span className="mo-tile-hint">{hint}</span> : null}
    </motion.button>
  );
}

function MoPreviewRow({
  item,
  now,
  delay,
  onTap,
}: {
  item: ActivityItem;
  now: Date;
  delay: number;
  onTap?: () => void;
}) {
  const tappable = Boolean(item.entryId && onTap);
  const cat = item.category ? getCategory(item.category) : null;
  const isIn = item.direction === "in";
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
      className="mo-p"
      data-tappable={tappable ? "true" : undefined}
      style={{ "--mo-p-accent": accent } as React.CSSProperties}
    >
      <span aria-hidden className="mo-p-icon">
        <Icon className="size-5" strokeWidth={1.6} />
      </span>
      <div className="mo-p-body">
        <span className="mo-p-title">{item.title}</span>
        <span className="mo-p-meta">
          {cat ? cat.label : ""}
          {cat ? <span aria-hidden> · </span> : null}
          {whenLabel(item.ts, item.hasRealTime, now)}
        </span>
      </div>
      <span className="mo-p-amount" data-mono="true" dir="ltr">
        {sign}
        {ILS.format(item.amount)}
      </span>
    </motion.li>
  );
}
