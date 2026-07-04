"use client";

// Monthly cashflow · compact launcher rebuild.
//
// Prior card was a full .glass-card with a hero stat strip, a 3-col
// stat row, a month-tile grid, and a folder body — ~500px tall on
// mobile. The rebuild flattens it into:
//   1. Static thin header (🗓️ תזרים חודשי · sub + hairline glow).
//   2. 4-tile month grid (חודש נוכחי + 3 קדימה) — short cards, glass,
//      month + projected EOM balance + tone dot.
//   3. Inline expansion under the grid when a tile is tapped —
//      4 collapsible source groups (הכנסות / חיובי בנק / כרטיסים /
//      הלוואות). One month open at a time.
//
// UI/UX only. buildMonthlyCashflow + every engine downstream stays
// exactly as it was.

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  CalendarRange,
  ChevronDown,
  CreditCard,
  HandCoins,
  Landmark,
  Wallet,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import {
  buildMonthlyCashflow,
  type MonthlyCashflowFolder,
  type MonthlySourceGroup,
} from "@/lib/monthly-cashflow";
import { CardEmpty } from "@/components/ui/card-empty";
import { tap } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "short",
});

const EASE = [0.32, 0.72, 0, 1] as const;

const SOURCE_ORDER: ReadonlyArray<MonthlySourceGroup["source"]> = [
  "income",
  "bank_debit",
  "card",
  "loan",
];
const SOURCE_META: Record<
  MonthlySourceGroup["source"],
  { tone: string; icon: React.ReactNode; label: string }
> = {
  income: {
    tone: "#34D399",
    icon: <Wallet className="size-4" />,
    label: "הכנסות",
  },
  bank_debit: {
    tone: "#60A5FA",
    icon: <Landmark className="size-4" />,
    label: "חיובי בנק",
  },
  card: {
    tone: "#A78BFA",
    icon: <CreditCard className="size-4" />,
    label: "כרטיסים",
  },
  loan: {
    tone: "#F87171",
    icon: <HandCoins className="size-4" />,
    label: "הלוואות",
  },
};

export function MonthlyCashflowCard({
  windowDays = 120,
}: {
  windowDays?: number;
  title?: string;
}) {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);

  const folders = useMemo(() => {
    if (!hydrated) return [];
    return buildMonthlyCashflow({
      accounts,
      loans,
      incomes,
      rules,
      statuses,
      entries,
      windowDays,
    });
  }, [hydrated, accounts, loans, incomes, rules, statuses, entries, windowDays]);

  const visible = folders.slice(0, 4);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const openFolder =
    visible.find((f) => f.monthKey === openKey) ?? null;

  if (!hydrated) return null;
  if (visible.length === 0) {
    return (
      <>
        <MonthlyHeader />
        <CardEmpty
          icon={<CalendarRange className="size-4" />}
          title="אין עדיין תזרים עתידי"
          reason="הוסף הוצאות קבועות, הלוואות, או הכנסה צפויה כדי לראות חלוקה לחודשים."
        />
      </>
    );
  }

  return (
    <div className="mcf-root" dir="rtl">
      <MonthlyHeader />

      <div className="mcf-grid" data-open={openKey ?? undefined}>
        {visible.map((folder, idx) => (
          <MonthTile
            key={folder.monthKey}
            folder={folder}
            tierIndex={idx}
            active={openKey === folder.monthKey}
            dimmed={openKey !== null && openKey !== folder.monthKey}
            onClick={() => {
              tap();
              setOpenKey((prev) =>
                prev === folder.monthKey ? null : folder.monthKey,
              );
            }}
          />
        ))}
      </div>

      <AnimatePresence initial={false} mode="wait">
        {openFolder ? (
          <FolderExpansion
            key={openFolder.monthKey}
            folder={openFolder}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ── Header ──────────────────────────────────────────────────

function MonthlyHeader() {
  return (
    <header
      className="sally-section-header"
      dir="rtl"
      aria-label="תזרים חודשי"
    >
      <div className="sally-section-header-text">
        <span className="sally-section-header-title">🗓️ תזרים חודשי</span>
        <span className="sally-section-header-sub">
          חודש נוכחי + 3 חודשים קדימה · לחץ חודש לפירוט
        </span>
      </div>
      <span aria-hidden className="sally-section-header-divider" />
    </header>
  );
}

// ── Month tile ──────────────────────────────────────────────

function MonthTile({
  folder,
  tierIndex,
  active,
  dimmed,
  onClick,
}: {
  folder: MonthlyCashflowFolder;
  tierIndex: number;
  active: boolean;
  dimmed: boolean;
  onClick: () => void;
}) {
  const reduced = useReducedMotion();
  const tier =
    tierIndex === 0
      ? "current"
      : tierIndex === 1
        ? "next"
        : "future";
  const tierLabel =
    tier === "current"
      ? "חודש נוכחי"
      : tier === "next"
        ? "החודש הבא"
        : `+${tierIndex}`;
  const netNegative = folder.net < 0;
  const tone: "safe" | "danger" = netNegative ? "danger" : "safe";
  return (
    <motion.button
      type="button"
      className="mcf-tile"
      data-tone={tone}
      data-tier={tier}
      data-active={active ? "true" : undefined}
      data-dimmed={dimmed ? "true" : undefined}
      onClick={onClick}
      aria-expanded={active}
      aria-label={`${tierLabel} · ${folder.fullLabel} · ${
        netNegative ? "גירעון" : "עודף"
      } ${ILS.format(Math.abs(Math.round(folder.net)))}`}
      whileTap={{ scale: 0.97 }}
      transition={{
        type: "spring",
        stiffness: 380,
        damping: 34,
        duration: reduced ? 0.12 : undefined,
      }}
    >
      <span aria-hidden className="mcf-tile-dot" />
      <span className="mcf-tile-tier">{tierLabel}</span>
      <span className="mcf-tile-name">{folder.fullLabel}</span>
      <span className="mcf-tile-value" data-mono="true" dir="ltr">
        {netNegative ? "−" : "+"}
        {ILS.format(Math.abs(Math.round(folder.net)))}
      </span>
    </motion.button>
  );
}

// ── Expansion ───────────────────────────────────────────────

function FolderExpansion({ folder }: { folder: MonthlyCashflowFolder }) {
  const reduced = useReducedMotion();
  return (
    <motion.section
      layout
      className="mcf-lens"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
      transition={{
        type: "spring",
        stiffness: 320,
        damping: 30,
        duration: reduced ? 0.12 : undefined,
      }}
    >
      <header className="mcf-lens-head">
        <div className="mcf-lens-head-text">
          <span className="mcf-lens-eyebrow">פירוט</span>
          <span className="mcf-lens-title">{folder.fullLabel}</span>
        </div>
        <div className="mcf-lens-strip">
          <span className="mcf-lens-strip-item" data-mono="true" dir="ltr">
            +{ILS.format(Math.round(folder.totalIncome))}
          </span>
          <span
            aria-hidden
            className="mcf-lens-strip-dot"
          />
          <span className="mcf-lens-strip-item" data-mono="true" dir="ltr">
            −{ILS.format(Math.round(folder.totalExpense))}
          </span>
        </div>
      </header>

      <ul className="mcf-groups">
        {SOURCE_ORDER.map((src, idx) => {
          const group = folder.bySource[src];
          if (group.total === 0) return null;
          return (
            <SourceGroup
              key={src}
              group={group}
              delay={Math.min(idx * 0.04, 0.18)}
            />
          );
        })}
      </ul>
    </motion.section>
  );
}

function SourceGroup({
  group,
  delay,
}: {
  group: MonthlySourceGroup;
  delay: number;
}) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  const meta = SOURCE_META[group.source];
  const isInflow = group.source === "income";
  const sign = isInflow ? "+" : "−";

  return (
    <motion.li
      layout
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: reduced ? 0.12 : 0.32, ease: EASE }}
      className="mcf-group"
      style={{ "--mcf-tone": meta.tone } as React.CSSProperties}
    >
      <button
        type="button"
        onClick={() => {
          tap();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className="mcf-group-head"
      >
        <span aria-hidden className="mcf-group-icon">
          {meta.icon}
        </span>
        <div className="mcf-group-text">
          <span className="mcf-group-label">{meta.label}</span>
          <span className="mcf-group-count">
            {group.events.length} פעולות
          </span>
        </div>
        <span className="mcf-group-amount" data-mono="true" dir="ltr">
          {sign}
          {ILS.format(Math.round(group.total))}
        </span>
        <motion.span
          aria-hidden
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="mcf-group-chev"
        >
          <ChevronDown className="size-4" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.ul
            key="body"
            initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: reduced ? 0.12 : 0.3, ease: EASE }}
            className="mcf-events"
          >
            {group.events.map((ev, i) => (
              <li key={`${ev.refId}-${i}`} className="mcf-event">
                <span aria-hidden className="mcf-event-rail" />
                <div className="mcf-event-body">
                  <span className="mcf-event-label">{ev.label}</span>
                  <span className="mcf-event-date">
                    {DAY_FMT.format(new Date(ev.effectiveCashAt))}
                  </span>
                </div>
                <span
                  className="mcf-event-amount"
                  data-mono="true"
                  dir="ltr"
                >
                  {sign}
                  {ILS.format(Math.round(ev.amount))}
                </span>
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </motion.li>
  );
}
