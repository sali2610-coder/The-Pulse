"use client";

// Phase 376 — Expenses Commitments Cockpit V2.
//
// Addition-only premium summary layer above the existing Expenses
// surface. NEVER removes, reorders, or hides any existing card.
// NEVER opens a modal / drawer / sheet / new screen.
//
// What the user sees in under 3 seconds:
//   • hero total ("סך התחייבויות החודש")
//   • four glass blocks (אשראי / הלוואות / בנק / מזומן)
//   • one calm footer line ("כל חיוב נספר פעם אחת בלבד")
//
// What the user gets on tap:
//   • inline height expansion BELOW the tapped block
//   • shows the canonical breakdown for that lane only
//   • tap again → collapses back. No navigation.
//
// Single source of truth — getMonthlyObligationBreakdown +
// getCreditCardExposure (Phases 370 + 371). Engine untouched.

import { useMemo, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import {
  Banknote,
  CreditCard,
  Landmark,
  Sparkles,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import {
  getMonthlyObligationBreakdown,
  type ObligationLane,
} from "@/lib/monthly-obligation-breakdown";
import { getCreditCardExposure } from "@/lib/credit-card-exposure";
import {
  buildEngineCtx,
  getOrphanedEntries,
  type OrphanedEntry,
} from "@/lib/financial-engine";
import { tap as hapticTap } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

type LaneId = ObligationLane;

const LANE_META: Record<
  LaneId,
  { label: string; icon: LucideIcon; tone: string; countWord: string }
> = {
  creditCards: {
    label: "אשראי",
    icon: CreditCard,
    tone: "#75F5FF",
    countWord: "פריטים",
  },
  loans: {
    label: "הלוואות",
    icon: Banknote,
    tone: "#A78BFA",
    countWord: "פעילות",
  },
  bankFixed: {
    label: "בנק",
    icon: Landmark,
    tone: "#F6D970",
    countWord: "חיובים",
  },
  cash: {
    label: "מזומן",
    icon: Wallet,
    tone: "#34D399",
    countWord: "משיכות",
  },
};

// Order requested by spec: Credit → Loans → Bank → Cash.
const LANE_ORDER: LaneId[] = ["creditCards", "loans", "bankFixed", "cash"];

export function ExpensesCommitmentsCockpit() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const rules = useFinanceStore((s) => s.rules);
  const loans = useFinanceStore((s) => s.loans);
  const entries = useFinanceStore((s) => s.entries);
  const statuses = useFinanceStore((s) => s.statuses);
  const incomes = useFinanceStore((s) => s.incomes);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  const breakdown = useMemo(() => {
    if (!hydrated) return null;
    return getMonthlyObligationBreakdown({
      rules,
      loans,
      entries,
      statuses,
      monthKey: currentMonthKey(),
    });
  }, [hydrated, rules, loans, entries, statuses]);

  const exposure = useMemo(() => {
    if (!hydrated) return null;
    return getCreditCardExposure({
      rules,
      entries,
      statuses,
      monthKey: currentMonthKey(),
    });
  }, [hydrated, rules, entries, statuses]);

  // Phase 398 — completeness sentinel. Surfaces any entry that the
  // donut/activity feed shows but the cockpit lanes miss, so no
  // charge silently falls through.
  const orphans = useMemo<OrphanedEntry[]>(() => {
    if (!hydrated) return [];
    return getOrphanedEntries(
      buildEngineCtx({
        accounts,
        rules,
        statuses,
        entries,
        loans,
        incomes,
        monthlyBudget,
        monthKey: currentMonthKey(),
      }),
    );
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

  const [openLane, setOpenLane] = useState<LaneId | null>(null);

  if (!breakdown) {
    return <div className="glass-card h-44 animate-pulse rounded-3xl" />;
  }
  if (breakdown.total === 0) {
    return null; // Don't crowd the tab when there's nothing to summarize yet.
  }

  const laneData: Record<LaneId, { amount: number; count: number }> = {
    creditCards: {
      amount: breakdown.creditCardsTotal,
      count: breakdown.counts.creditCards,
    },
    loans: { amount: breakdown.loansTotal, count: breakdown.counts.loans },
    bankFixed: {
      amount: breakdown.bankFixedTotal,
      count: breakdown.counts.bankFixed,
    },
    cash: { amount: breakdown.cashTotal, count: breakdown.counts.cash },
  };

  const activeTone =
    openLane !== null ? LANE_META[openLane].tone : "#D4AF37";
  return (
    <section
      className="cc-hero"
      dir="rtl"
      aria-label="סך התחייבויות החודש"
      data-open-tone={openLane ?? undefined}
      style={{ ["--cc-active-tone" as string]: activeTone }}
    >
      <span aria-hidden className="cc-hero-aurora" />
      <span aria-hidden className="cc-hero-gloss" />
      <span aria-hidden className="cc-hero-emboss" />

      <header className="cc-hero-head">
        <span className="cc-hero-eyebrow">
          <Sparkles className="size-3" aria-hidden />
          סך התחייבויות החודש
        </span>
        <SpringAmount amount={breakdown.total} tone={activeTone} size="hero" />
        <span className="cc-hero-sub">
          {breakdown.monthKey} · לחץ כרטיס לפירוט
        </span>
      </header>

      <span aria-hidden className="cc-hairline" />

      <div className="cc-grid" role="tablist" aria-label="חלוקת התחייבויות">
        {LANE_ORDER.map((id) => (
          <LaneBlock
            key={id}
            lane={id}
            amount={laneData[id].amount}
            count={laneData[id].count}
            open={openLane === id}
            onTap={() => {
              hapticTap();
              setOpenLane((cur) => (cur === id ? null : id));
            }}
          />
        ))}
      </div>

      <AnimatePresence initial={false}>
        {openLane ? (
          <motion.div
            key={openLane}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            className="cc-detail-wrap"
          >
            <LaneDetail
              lane={openLane}
              breakdown={breakdown}
              exposure={exposure}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {orphans.length > 0 ? <OrphanWarning orphans={orphans} /> : null}

      <p className="cc-footer">כל חיוב נספר פעם אחת בלבד</p>
    </section>
  );
}

function OrphanWarning({ orphans }: { orphans: OrphanedEntry[] }) {
  const total = orphans.reduce((s, o) => s + o.amount, 0);
  return (
    <div
      className="mt-3 rounded-2xl border border-[#FBBF24]/40 bg-[#FBBF24]/[0.06] p-3"
      dir="rtl"
      role="status"
      aria-label="חיובים שלא נקלטו באף לשונית"
    >
      <div className="flex items-center justify-between gap-2 pb-1.5">
        <span className="text-[11px] uppercase tracking-[0.22em] text-[#FBBF24]">
          חיובים שלא נקלטו · {orphans.length}
        </span>
        <span
          data-mono="true"
          dir="ltr"
          className="text-[12px] font-medium text-[#FBBF24]"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {ILS.format(Math.round(total))}
        </span>
      </div>
      <p className="pb-2 text-[11px] text-foreground/80">
        ההוצאות הבאות מופיעות בפעילות החודש אך אינן נספרות באף לשונית
        קיימת. תיקנו זאת כדי שלא יחזור.
      </p>
      <ul className="flex flex-col gap-1">
        {orphans.map((o) => (
          <li
            key={o.refId}
            className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-2.5 py-2"
          >
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="line-clamp-1 text-[12px] text-foreground/90">
                {o.label}
              </span>
              <span className="text-[10.5px] text-muted-foreground/80">
                {formatRowDate(o.chargeDate)} · {o.paymentMethod === "cash" ? "מזומן" : "אשראי"}
              </span>
            </div>
            <span
              data-mono="true"
              dir="ltr"
              className="text-[12px] font-medium"
              style={{
                color: "#FBBF24",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {ILS.format(Math.round(o.amount))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LaneBlock({
  lane,
  amount,
  count,
  open,
  onTap,
}: {
  lane: LaneId;
  amount: number;
  count: number;
  open: boolean;
  onTap: () => void;
}) {
  const meta = LANE_META[lane];
  const inactive = amount === 0;
  return (
    <motion.button
      type="button"
      role="tab"
      aria-selected={open}
      onClick={onTap}
      whileTap={{ scale: 0.965 }}
      animate={{ scale: open ? 1.015 : 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
      className="cc-tile"
      data-tone={lane}
      data-open={open ? "true" : undefined}
      data-inactive={inactive ? "true" : undefined}
      style={{ ["--cc-tone" as string]: meta.tone }}
      aria-pressed={open}
      aria-label={`${meta.label} ${ILS.format(amount)} · ${count} ${meta.countWord}`}
    >
      <span aria-hidden className="cc-tile-glow" />
      <span aria-hidden className="cc-tile-gloss" />
      <span className="cc-tile-row">
        <span aria-hidden className="cc-tile-icon">
          <meta.icon className="size-4" strokeWidth={1.7} />
        </span>
        <span className="cc-tile-label">{meta.label}</span>
      </span>
      <SpringAmount amount={amount} tone={meta.tone} size="tile" />
      <span className="cc-tile-count">
        {count > 0 ? `${count} ${meta.countWord}` : "אין פריטים החודש"}
      </span>
    </motion.button>
  );
}

function LaneDetail({
  lane,
  breakdown,
  exposure,
}: {
  lane: LaneId;
  breakdown: ReturnType<typeof getMonthlyObligationBreakdown>;
  exposure: ReturnType<typeof getCreditCardExposure> | null;
}) {
  const meta = LANE_META[lane];

  // Credit gets the canonical exposure breakdown (Phase 371).
  if (lane === "creditCards" && exposure) {
    const cells: Array<{ label: string; value: number }> = [
      { label: "חיובים קבועים על הכרטיס", value: exposure.futureCardCharges },
      { label: "תשלומים פתוחים", value: exposure.existingInstallments },
      { label: "עסקאות Wallet", value: exposure.walletTransactions },
      { label: "ייבוא / SMS", value: exposure.importedTransactions },
      { label: "תיעוד ידני", value: exposure.manualCardTransactions },
      { label: "ממתינים לאישור", value: exposure.pendingTransactions },
    ];
    return (
      <div
        className="cc-detail"
        dir="rtl"
        style={{ ["--cc-tone" as string]: meta.tone }}
      >
        <span aria-hidden className="cc-detail-hairline" />
        <ul className="cc-detail-grid">
          {cells.map((c) => (
            <DetailRow
              key={c.label}
              label={c.label}
              value={c.value}
              tone={meta.tone}
            />
          ))}
        </ul>
      </div>
    );
  }

  // Loans / Bank / Cash → calm list of explanation rows.
  const rows = breakdown.explanationRows.filter((r) => r.lane === lane);
  if (rows.length === 0) {
    return (
      <div
        className="cc-detail cc-detail-empty"
        dir="rtl"
        style={{ ["--cc-tone" as string]: meta.tone }}
      >
        <span aria-hidden className="cc-detail-hairline" />
        <p>אין פריטים בקטגוריה הזו החודש.</p>
      </div>
    );
  }
  return (
    <div
      className="cc-detail"
      dir="rtl"
      style={{ ["--cc-tone" as string]: meta.tone }}
    >
      <span aria-hidden className="cc-detail-hairline" />
      <ul className="cc-detail-list">
        {rows.map((r) => (
          <li key={r.id} className="cc-detail-row">
            <div className="cc-detail-row-body">
              <span className="cc-detail-row-title">{r.label}</span>
              {r.chargeDate ? (
                <span className="cc-detail-row-date">
                  {formatRowDate(r.chargeDate)}
                </span>
              ) : null}
            </div>
            <span
              data-mono="true"
              dir="ltr"
              className="cc-detail-row-amount"
              style={{ color: meta.tone }}
            >
              {ILS.format(Math.round(r.amount))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ROW_DATE_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
});

function formatRowDate(iso: string): string {
  try {
    return ROW_DATE_FMT.format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function DetailRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <li className="cc-detail-cell">
      <span className="cc-detail-cell-label">{label}</span>
      <span
        data-mono="true"
        dir="ltr"
        className="cc-detail-cell-value"
        style={{ color: tone }}
      >
        {ILS.format(value)}
      </span>
    </li>
  );
}

function SpringAmount({
  amount,
  tone,
  size = "small",
}: {
  amount: number;
  tone: string;
  size?: "hero" | "small" | "tile";
}) {
  const mv = useMotionValue(amount);
  const spring = useSpring(mv, { stiffness: 90, damping: 24, mass: 0.5 });
  const text = useTransform(spring, (v) => ILS.format(Math.round(v)));
  mv.set(amount);
  if (size === "hero") {
    return (
      <motion.span
        data-mono="true"
        dir="ltr"
        className="cc-hero-amount"
        style={{
          textShadow: `0 0 26px ${tone}55, 0 0 60px ${tone}22`,
        }}
      >
        <motion.span>{text}</motion.span>
      </motion.span>
    );
  }
  if (size === "tile") {
    return (
      <motion.span
        data-mono="true"
        dir="ltr"
        className="cc-tile-amount"
        style={{
          color: tone,
          textShadow: `0 0 14px ${tone}55`,
        }}
      >
        <motion.span>{text}</motion.span>
      </motion.span>
    );
  }
  return (
    <motion.span
      data-mono="true"
      dir="ltr"
      className="text-[14px] font-medium leading-none"
      style={{
        color: tone,
        textShadow: `0 0 12px ${tone}33`,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <motion.span>{text}</motion.span>
    </motion.span>
  );
}
