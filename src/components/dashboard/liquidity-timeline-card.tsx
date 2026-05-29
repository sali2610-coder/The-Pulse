"use client";

// Phase 208 — true chronological liquidity timeline.
// Phase 299 — restructure into a grouped CFO-style forecast.
//
// Same engine inputs (buildCashFlowBuckets + incomes loop) — every
// row is engine output. Presentation is now:
//
//   • day-bucket grouping (היום / מחר / 3 ימים / שבוע / החודש)
//   • multi-select filter chips (All / income / fixed / cards /
//     installments / one-time / loans)
//   • running balance preview after every event with safe / watch /
//     danger color tone
//   • premium empty state when there's nothing in range
//
// Engine + financial math are untouched.

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Banknote,
  CalendarClock,
  CreditCard,
  HandCoins,
  Landmark,
  Receipt,
  ShoppingBag,
  Wallet,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { buildCashFlowBuckets } from "@/lib/cash-flow-bucket";
import { SectionHeader } from "@/components/ui/section-header";
import { CardEmpty } from "@/components/ui/card-empty";
import { tap } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

type RowKind = "income" | "fixed" | "card" | "installment" | "loan" | "oneTime";

const KIND_TONE: Record<RowKind, string> = {
  income: "#34D399",
  fixed: "#60A5FA",
  card: "#A78BFA",
  installment: "#F59E0B",
  loan: "#F87171",
  oneTime: "#22D3EE",
};

const KIND_ICON: Record<RowKind, React.ReactNode> = {
  income: <Wallet className="size-3.5" />,
  fixed: <Landmark className="size-3.5" />,
  card: <CreditCard className="size-3.5" />,
  installment: <HandCoins className="size-3.5" />,
  loan: <Banknote className="size-3.5" />,
  oneTime: <ShoppingBag className="size-3.5" />,
};

const KIND_LABEL: Record<RowKind, string> = {
  income: "הכנסה",
  fixed: "קבוע",
  card: "כרטיס",
  installment: "תשלום",
  loan: "הלוואה",
  oneTime: "חד-פעמי",
};

type TimelineRow = {
  id: string;
  whenISO: string;
  label: string;
  sourceLabel: string;
  amount: number;
  positive: boolean;
  kind: RowKind;
};

type Filters = Record<RowKind, boolean>;
const DEFAULT_FILTERS: Filters = {
  income: true,
  fixed: true,
  card: true,
  installment: true,
  loan: true,
  oneTime: true,
};

const FILTER_ORDER: RowKind[] = [
  "income",
  "fixed",
  "card",
  "installment",
  "loan",
  "oneTime",
];

const BUCKETS = [
  { key: "today", label: "היום", max: 0 },
  { key: "tomorrow", label: "מחר", max: 1 },
  { key: "next3", label: "3 ימים", max: 3 },
  { key: "next7", label: "שבוע", max: 7 },
  { key: "later", label: "המשך החודש", max: Infinity },
] as const;

export function LiquidityTimelineCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  // Starting balance = sum of active bank anchors. Same convention as
  // every other forward-looking surface in the app.
  const startingBalance = useMemo(() => {
    if (!hydrated) return 0;
    return accounts
      .filter(
        (a) =>
          a.active && a.kind === "bank" && typeof a.anchorBalance === "number",
      )
      .reduce((s, a) => s + (a.anchorBalance ?? 0), 0);
  }, [hydrated, accounts]);

  const rows = useMemo<TimelineRow[]>(() => {
    if (!hydrated) return [];
    const now = new Date();
    const horizon = new Date(now.getTime() + 35 * 86_400_000);
    const out: TimelineRow[] = [];

    const report = buildCashFlowBuckets({
      accounts,
      loans,
      rules,
      statuses,
      entries,
    });
    for (const bucket of report.buckets) {
      for (const ob of bucket.obligations) {
        let kind: RowKind;
        if (bucket.source === "loan") kind = "loan";
        else if (bucket.source === "bank_debit") kind = "fixed";
        else if (ob.kind === "installment") kind = "installment";
        else if (ob.kind === "recurring") kind = "fixed";
        else if (ob.kind === "card_entry") kind = "oneTime";
        else kind = "card";
        out.push({
          id: `${bucket.id}:${ob.refId}`,
          whenISO: ob.effectiveCashAt,
          label: ob.label,
          sourceLabel: bucket.label,
          amount: -ob.amount,
          positive: false,
          kind,
        });
      }
    }

    for (const inc of incomes) {
      if (!inc.active) continue;
      if (inc.amount <= 0) continue;
      const candidate = dateOfDayOfMonth({
        ref: now,
        dayOfMonth: inc.dayOfMonth,
      });
      if (
        candidate.getTime() > now.getTime() &&
        candidate.getTime() <= horizon.getTime()
      ) {
        out.push({
          id: `inc:${inc.id}:${candidate.toISOString()}`,
          whenISO: candidate.toISOString(),
          label: inc.label,
          sourceLabel: "הכנסה",
          amount: inc.amount,
          positive: true,
          kind: "income",
        });
      }
      const next = new Date(candidate);
      next.setMonth(next.getMonth() + 1);
      if (
        next.getTime() > now.getTime() &&
        next.getTime() <= horizon.getTime()
      ) {
        out.push({
          id: `inc:${inc.id}:${next.toISOString()}`,
          whenISO: next.toISOString(),
          label: inc.label,
          sourceLabel: "הכנסה",
          amount: inc.amount,
          positive: true,
          kind: "income",
        });
      }
    }

    out.sort(
      (a, b) => new Date(a.whenISO).getTime() - new Date(b.whenISO).getTime(),
    );
    return out;
  }, [hydrated, accounts, loans, incomes, rules, statuses, entries]);

  // Apply filters first, then compute running balance over filtered rows.
  const filteredRows = useMemo(() => {
    return rows.filter((r) => filters[r.kind]);
  }, [rows, filters]);

  const withBalance = useMemo(() => {
    let bal = startingBalance;
    return filteredRows.map((r) => {
      bal += r.amount;
      return { row: r, balanceAfter: bal };
    });
  }, [filteredRows, startingBalance]);

  // Group rows into day buckets.
  const grouped = useMemo(() => {
    const now = new Date();
    const today = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const buckets: Array<{
      key: string;
      label: string;
      rows: Array<{ row: TimelineRow; balanceAfter: number }>;
    }> = BUCKETS.map((b) => ({ key: b.key, label: b.label, rows: [] }));
    for (const r of withBalance) {
      const when = new Date(r.row.whenISO);
      const dayMs = Math.floor((when.getTime() - today) / 86_400_000);
      const idx = BUCKETS.findIndex((b) => dayMs <= b.max);
      const finalIdx = idx === -1 ? BUCKETS.length - 1 : idx;
      buckets[finalIdx].rows.push(r);
    }
    return buckets.filter((b) => b.rows.length > 0);
  }, [withBalance]);

  if (!hydrated) return null;

  const activeFilters = FILTER_ORDER.filter((k) => filters[k]);

  return (
    <section className="glass-card flex flex-col gap-3 rounded-3xl p-4">
      <SectionHeader
        icon={<CalendarClock />}
        title="ציר נזילות 35 ימים"
        trailing={
          <span className="text-[10px] text-muted-foreground/70" dir="ltr">
            {filteredRows.length}/{rows.length}
          </span>
        }
      />

      <FilterRow
        filters={filters}
        onToggle={(k) => {
          tap();
          setFilters((f) => ({ ...f, [k]: !f[k] }));
        }}
        onAll={() => {
          tap();
          setFilters(DEFAULT_FILTERS);
        }}
      />

      {activeFilters.length === 0 ? (
        <CardEmpty
          icon={<Receipt className="size-4" />}
          title="בחר לפחות סוג אחד להצגה"
          reason="כל המסננים כבויים. בחר סוג חיוב/הכנסה כדי לראות את הציר."
        />
      ) : rows.length === 0 ? (
        <CardEmpty
          icon={<Receipt className="size-4" />}
          title="אין אירועי נזילות צפויים"
          reason="לא נמצאו חיובים, הוצאות קבועות, הלוואות או הכנסות עתידיות לחלון הקרוב."
          unlockHint="הגדר חשבונות / כרטיסים / הכנסות בהגדרות כדי שהציר ימולא."
        />
      ) : filteredRows.length === 0 ? (
        <CardEmpty
          icon={<Receipt className="size-4" />}
          title="אין אירועים בסינון הזה"
          reason="נסה לסמן עוד סוגי חיוב/הכנסה."
        />
      ) : (
        <div className="flex flex-col gap-3">
          <BalanceStrip startingBalance={startingBalance} rows={withBalance} />
          <ol className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {grouped.map((g, gIdx) => (
                <motion.li
                  key={g.key}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{
                    delay: Math.min(gIdx * 0.04, 0.2),
                    duration: 0.22,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  <DayGroup label={g.label} rows={g.rows} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        </div>
      )}
    </section>
  );
}

function FilterRow({
  filters,
  onToggle,
  onAll,
}: {
  filters: Filters;
  onToggle: (k: RowKind) => void;
  onAll: () => void;
}) {
  const allOn = FILTER_ORDER.every((k) => filters[k]);
  return (
    <div
      className="sticky top-0 z-10 flex flex-wrap gap-1.5 bg-transparent"
      role="radiogroup"
      aria-label="סינון לפי סוג"
    >
      <button
        type="button"
        onClick={onAll}
        aria-pressed={allOn}
        className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60 ${
          allOn
            ? "bg-[color:var(--neon)]/20 text-[color:var(--neon)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--neon)_55%,transparent)]"
            : "border border-white/10 bg-black/30 text-muted-foreground hover:text-foreground"
        }`}
      >
        הכל
      </button>
      {FILTER_ORDER.map((k) => {
        const active = filters[k];
        const tone = KIND_TONE[k];
        return (
          <button
            key={k}
            type="button"
            onClick={() => onToggle(k)}
            aria-pressed={active}
            className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60 ${
              active ? "" : "border border-white/10 bg-black/30 text-muted-foreground hover:text-foreground"
            }`}
            style={
              active
                ? {
                    background: `${tone}26`,
                    color: tone,
                    boxShadow: `inset 0 0 0 1px ${tone}55`,
                  }
                : undefined
            }
          >
            {KIND_LABEL[k]}
          </button>
        );
      })}
    </div>
  );
}

function BalanceStrip({
  startingBalance,
  rows,
}: {
  startingBalance: number;
  rows: Array<{ row: TimelineRow; balanceAfter: number }>;
}) {
  if (rows.length === 0) return null;
  const lowest = rows.reduce(
    (acc, r) => Math.min(acc, r.balanceAfter),
    startingBalance,
  );
  const endBalance = rows[rows.length - 1].balanceAfter;
  const tone =
    lowest < 0
      ? { color: "#F87171", label: "סיכון למינוס" }
      : lowest < 1000
        ? { color: "#F59E0B", label: "מרווח קצר" }
        : { color: "#34D399", label: "בטוח" };
  return (
    <div
      className="grid grid-cols-3 gap-2 rounded-2xl border px-3 py-2.5"
      style={{
        background: `${tone.color}10`,
        borderColor: `${tone.color}33`,
      }}
    >
      <StripStat label="התחלה" value={startingBalance} />
      <StripStat
        label="הנקודה הנמוכה"
        value={lowest}
        tone={lowest < 0 ? "#F87171" : lowest < 1000 ? "#F59E0B" : "#34D399"}
      />
      <StripStat label="סוף 35 ימים" value={endBalance} tone={tone.color} />
    </div>
  );
}

function StripStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-micro text-muted-foreground">{label}</span>
      <span
        data-mono="true"
        dir="ltr"
        className="text-body font-medium"
        style={{ color: tone ?? "var(--foreground)" }}
      >
        {value < 0 ? "−" : ""}
        {ILS.format(Math.abs(Math.round(value)))}
      </span>
    </div>
  );
}

function DayGroup({
  label,
  rows,
}: {
  label: string;
  rows: Array<{ row: TimelineRow; balanceAfter: number }>;
}) {
  return (
    <section className="flex flex-col gap-1.5 rounded-2xl border border-white/8 bg-black/20 p-3">
      <header className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          {label}
        </span>
        <span className="text-[10px] text-muted-foreground/70" dir="ltr">
          {rows.length}
        </span>
      </header>
      <ul className="flex flex-col gap-1.5">
        {rows.map(({ row, balanceAfter }, idx) => (
          <TimelineRowItem
            key={row.id}
            row={row}
            balanceAfter={balanceAfter}
            index={idx}
          />
        ))}
      </ul>
    </section>
  );
}

function TimelineRowItem({
  row,
  balanceAfter,
  index,
}: {
  row: TimelineRow;
  balanceAfter: number;
  index: number;
}) {
  const tone = KIND_TONE[row.kind];
  const balanceTone =
    balanceAfter < 0
      ? "#F87171"
      : balanceAfter < 1000
        ? "#F59E0B"
        : "#34D399";
  return (
    <motion.li
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: Math.min(index * 0.025, 0.18),
        duration: 0.18,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="flex flex-col gap-1 rounded-xl border border-white/6 bg-black/30 p-2.5"
    >
      <div className="flex items-center gap-2.5">
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `${tone}22`, color: tone }}
        >
          {KIND_ICON[row.kind]}
        </span>
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-[12px] font-medium text-foreground">
            {row.label}
          </span>
          <span className="text-[10px] text-muted-foreground/85">
            {KIND_LABEL[row.kind]} · {row.sourceLabel} ·{" "}
            {DAY_FMT.format(new Date(row.whenISO))}
          </span>
        </div>
        <span
          data-mono="true"
          dir="ltr"
          className="shrink-0 text-[13px] font-medium"
          style={{ color: row.positive ? "#34D399" : "#F87171" }}
        >
          {row.positive ? "+" : "−"}
          {ILS.format(Math.abs(row.amount))}
        </span>
      </div>
      <div
        className="flex items-baseline justify-between rounded-md border-t border-white/4 px-1 pt-1.5 text-[10px]"
        style={{ color: balanceTone }}
      >
        <span className="text-muted-foreground/85">יתרה לאחר חיוב</span>
        <span data-mono="true" dir="ltr">
          {balanceAfter < 0 ? "−" : ""}
          {ILS.format(Math.abs(Math.round(balanceAfter)))}
        </span>
      </div>
    </motion.li>
  );
}

function dateOfDayOfMonth(args: { ref: Date; dayOfMonth: number }): Date {
  const ref = args.ref;
  const lastDay = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
  const day = Math.min(Math.max(1, args.dayOfMonth), lastDay);
  return new Date(ref.getFullYear(), ref.getMonth(), day, 12, 0, 0);
}
