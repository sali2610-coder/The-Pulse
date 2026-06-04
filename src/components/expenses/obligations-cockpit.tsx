"use client";

// Phase 370 — Monthly Obligations Cockpit.
//
// Sits at the top of the Expenses tab. Big hero number ("סה״כ
// החודש") + four tappable glass blocks (Credit / Bank / Loans /
// Cash). Each block's amount springs into place when the underlying
// breakdown changes. Tapping a block opens a calm bottom-sheet that
// lists the rows that make up the lane and explains the rule.
//
// Reads from getMonthlyObligationBreakdown — the canonical
// single-counting helper. Engine math untouched.

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

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import {
  getMonthlyObligationBreakdown,
  type MonthlyObligationBreakdown,
  type ObligationLane,
} from "@/lib/monthly-obligation-breakdown";
import { tap as hapticTap } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const LANE_META: Record<
  ObligationLane,
  { label: string; icon: LucideIcon; tone: string; explain: string }
> = {
  creditCards: {
    label: "אשראי",
    icon: CreditCard,
    tone: "#75F5FF",
    explain:
      "אשראי כולל הוצאות קבועות שנספרות על הכרטיס + עסקאות חודשיות. כל חיוב נספר פעם אחת בלבד.",
  },
  bankFixed: {
    label: "בנק",
    icon: Landmark,
    tone: "#F6D970",
    explain:
      "חיובי בנק כוללים הוראות קבע וחיובים ישירים שיורדים מהבנק. הוצאות שמשולמות באשראי לא נספרות פה.",
  },
  loans: {
    label: "הלוואות",
    icon: Banknote,
    tone: "#A78BFA",
    explain:
      "הלוואות נספרות בנפרד כדי למנוע ערבוב. סך התשלום החודשי של כל הלוואה פעילה.",
  },
  cash: {
    label: "מזומן",
    icon: Wallet,
    tone: "#34D399",
    explain:
      "כל המזומן שיוצא החודש — חיובים שסומנו כמזומן + משיכות מזומן שתועדו במערכת.",
  },
};

export function ObligationsCockpit() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const rules = useFinanceStore((s) => s.rules);
  const loans = useFinanceStore((s) => s.loans);
  const entries = useFinanceStore((s) => s.entries);

  const breakdown = useMemo<MonthlyObligationBreakdown | null>(() => {
    if (!hydrated) return null;
    return getMonthlyObligationBreakdown({
      rules,
      loans,
      entries,
      monthKey: currentMonthKey(),
    });
  }, [hydrated, rules, loans, entries]);

  const [openLane, setOpenLane] = useState<ObligationLane | "total" | null>(
    null,
  );

  if (!breakdown) {
    return (
      <section className="glass-card flex h-44 animate-pulse rounded-3xl" />
    );
  }

  if (breakdown.total === 0) {
    return (
      <section className="glass-card flex flex-col gap-1 rounded-3xl p-4 text-right" dir="rtl">
        <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          סך התחייבויות החודש
        </span>
        <span className="text-[13px] text-muted-foreground/85">
          עדיין אין חיובים קבועים מוגדרים. הוסף הוצאה קבועה או הלוואה
          כדי לראות את הסיכום.
        </span>
      </section>
    );
  }

  const lanes: Array<{ id: ObligationLane; amount: number; count: number }> = [
    { id: "creditCards", amount: breakdown.creditCardsTotal, count: breakdown.counts.creditCards },
    { id: "bankFixed", amount: breakdown.bankFixedTotal, count: breakdown.counts.bankFixed },
    { id: "loans", amount: breakdown.loansTotal, count: breakdown.counts.loans },
    { id: "cash", amount: breakdown.cashTotal, count: breakdown.counts.cash },
  ];

  return (
    <>
      <section
        className="glass-card relative flex flex-col gap-3 overflow-hidden rounded-3xl p-4"
        dir="rtl"
        aria-label="סך התחייבויות החודש"
      >
        {/* Soft atmosphere */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-32"
          style={{
            background:
              "radial-gradient(circle at 50% -20%, rgba(212,175,55,0.16) 0%, transparent 60%)",
          }}
        />

        {/* Hero total */}
        <button
          type="button"
          onClick={() => {
            hapticTap();
            setOpenLane("total");
          }}
          className="relative flex flex-col items-center gap-1 rounded-2xl py-2 text-center transition-colors hover:bg-white/[0.03]"
          aria-label="פירוט סך החודש"
        >
          <span className="inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.3em] text-muted-foreground">
            <Sparkles className="size-3 text-gold/80" aria-hidden />
            סך התחייבויות החודש
          </span>
          <AnimatedAmount amount={breakdown.total} tone="#D4AF37" hero />
          <span className="text-[11px] text-muted-foreground/80">
            לחץ לפירוט מלא
          </span>
        </button>

        {/* Glowing connector line */}
        <div
          aria-hidden
          className="mx-auto h-px w-32"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(212,175,55,0.45), transparent)",
          }}
        />

        {/* Lane blocks */}
        <div className="grid grid-cols-4 gap-2">
          {lanes.map((l) => (
            <LaneBlock
              key={l.id}
              lane={l.id}
              amount={l.amount}
              count={l.count}
              onTap={() => {
                hapticTap();
                setOpenLane(l.id);
              }}
            />
          ))}
        </div>

        <p className="text-center text-[10.5px] leading-relaxed text-muted-foreground/80">
          כל חיוב נספר פעם אחת בלבד
        </p>
      </section>

      <ObligationDetailSheet
        open={openLane !== null}
        lane={openLane}
        breakdown={breakdown}
        onOpenChange={(v) => {
          if (!v) setOpenLane(null);
        }}
      />
    </>
  );
}

function LaneBlock({
  lane,
  amount,
  count,
  onTap,
}: {
  lane: ObligationLane;
  amount: number;
  count: number;
  onTap: () => void;
}) {
  const meta = LANE_META[lane];
  const inactive = amount === 0;
  return (
    <motion.button
      type="button"
      onClick={onTap}
      whileTap={{ scale: 0.97 }}
      className="relative flex flex-col items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-2.5 text-center transition-colors hover:border-white/16"
      aria-label={`${meta.label} ${count} פריטים`}
      style={{
        opacity: inactive ? 0.55 : 1,
        boxShadow: inactive
          ? "none"
          : `0 0 22px -10px ${meta.tone}55, 0 1px 0 rgba(255,255,255,0.04) inset`,
      }}
    >
      <span
        aria-hidden
        className="flex size-7 items-center justify-center rounded-full"
        style={{ background: `${meta.tone}1f`, color: meta.tone }}
      >
        <meta.icon className="size-3.5" />
      </span>
      <span className="text-[10.5px] text-muted-foreground">{meta.label}</span>
      <AnimatedAmount amount={amount} tone={meta.tone} />
      {count > 0 ? (
        <span className="text-[9.5px] text-muted-foreground/70">
          {count} פריטים
        </span>
      ) : (
        <span className="text-[9.5px] text-muted-foreground/40">—</span>
      )}
    </motion.button>
  );
}

function AnimatedAmount({
  amount,
  tone,
  hero,
}: {
  amount: number;
  tone: string;
  hero?: boolean;
}) {
  const mv = useMotionValue(amount);
  const spring = useSpring(mv, { stiffness: 90, damping: 24, mass: 0.5 });
  const text = useTransform(spring, (v) => ILS.format(Math.round(v)));
  // Animate to new value on prop change.
  // (Per render — Framer's set is idempotent and cheap.)
  mv.set(amount);
  return (
    <motion.span
      data-mono="true"
      dir="ltr"
      className={
        hero
          ? "text-[34px] font-light leading-none tracking-tight"
          : "text-[13.5px] font-medium leading-none"
      }
      style={{
        color: hero ? "#F6F6F6" : tone,
        textShadow: hero
          ? `0 0 26px ${tone}44`
          : `0 0 14px ${tone}33`,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <motion.span>{text}</motion.span>
    </motion.span>
  );
}

function ObligationDetailSheet({
  open,
  lane,
  breakdown,
  onOpenChange,
}: {
  open: boolean;
  lane: ObligationLane | "total" | null;
  breakdown: MonthlyObligationBreakdown;
  onOpenChange: (v: boolean) => void;
}) {
  // Compose what the sheet renders. "total" → all rows + meta-explain.
  const rows =
    lane === null || lane === "total"
      ? breakdown.explanationRows
      : breakdown.explanationRows.filter((r) => r.lane === lane);
  const title =
    lane === "total" || lane === null
      ? "סך התחייבויות החודש"
      : LANE_META[lane].label;
  const explain =
    lane === "total" || lane === null
      ? "זה הסכום שיורד החודש מכל המקורות. כל חיוב נספר פעם אחת בלבד."
      : LANE_META[lane].explain;
  const tone =
    lane === "total" || lane === null ? "#D4AF37" : LANE_META[lane].tone;
  const total =
    lane === "total" || lane === null
      ? breakdown.total
      : lane === "creditCards"
        ? breakdown.creditCardsTotal
        : lane === "bankFixed"
          ? breakdown.bankFixedTotal
          : lane === "loans"
            ? breakdown.loansTotal
            : breakdown.cashTotal;

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
    >
      <div className="flex flex-col gap-3" dir="rtl">
        <header className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            {title}
          </span>
          <span className="text-[10.5px] text-muted-foreground/80">
            {breakdown.monthKey}
          </span>
        </header>

        <div className="flex items-baseline gap-2">
          <span
            data-mono="true"
            dir="ltr"
            className="text-[34px] font-light leading-none"
            style={{
              color: tone,
              textShadow: `0 0 28px ${tone}44`,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {ILS.format(total)}
          </span>
        </div>

        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          {explain}
        </p>

        {rows.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            <AnimatePresence initial={false}>
              {rows.map((r, idx) => (
                <motion.li
                  key={r.id}
                  initial={{ opacity: 0, x: 4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -4 }}
                  transition={{ duration: 0.22, delay: idx * 0.015 }}
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2"
                >
                  <div className="flex flex-1 flex-col gap-0.5">
                    <span className="line-clamp-1 text-[12.5px] text-foreground/90">
                      {r.label}
                    </span>
                    <span className="text-[10.5px] text-muted-foreground">
                      {laneLabel(r.lane)} · {kindLabel(r.kind)}
                    </span>
                  </div>
                  <span
                    data-mono="true"
                    dir="ltr"
                    className="text-[12.5px] font-medium"
                    style={{
                      color: LANE_META[r.lane].tone,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {ILS.format(Math.round(r.amount))}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        ) : (
          <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3 text-center text-[11.5px] text-muted-foreground">
            אין פריטים בלשונית הזו החודש.
          </div>
        )}

        {breakdown.duplicatesPrevented > 0 ? (
          <p className="rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-[10.5px] text-muted-foreground">
            המערכת מנעה {breakdown.duplicatesPrevented} ספירות כפולות
            בחישוב הזה.
          </p>
        ) : null}
      </div>
    </BottomSheet>
  );
}

function laneLabel(l: ObligationLane): string {
  return LANE_META[l].label;
}

function kindLabel(k: "rule" | "loan" | "entry" | "withdrawal"): string {
  switch (k) {
    case "rule":
      return "הוצאה קבועה";
    case "loan":
      return "תשלום הלוואה";
    case "entry":
      return "עסקה";
    case "withdrawal":
      return "משיכה";
    default:
      return "";
  }
}
