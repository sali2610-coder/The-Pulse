"use client";

// Phase 208 — true chronological liquidity timeline.
//
// Flattens every bucket's obligations + every income event into a
// single date-ordered list. Each row carries source provenance
// (Isracard / MAX / loan name / salary) so the user reads "what
// hits when" instead of a fused total.

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  CalendarClock,
  CreditCard,
  Landmark,
  Receipt,
  Wallet,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { buildCashFlowBuckets } from "@/lib/cash-flow-bucket";
import { SectionHeader } from "@/components/ui/section-header";
import { CardEmpty } from "@/components/ui/card-empty";
import { listReveal } from "@/lib/motion-tokens";

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

type TimelineRow = {
  whenISO: string;
  label: string;
  sourceLabel: string;
  amount: number;
  positive: boolean;
  icon: React.ReactNode;
  tone: string;
};

export function LiquidityTimelineCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);

  const rows = useMemo<TimelineRow[]>(() => {
    if (!hydrated) return [];
    const now = new Date();
    const horizon = new Date(now.getTime() + 35 * 86_400_000);
    const out: TimelineRow[] = [];

    // 1. Bucketed obligations.
    const report = buildCashFlowBuckets({
      accounts,
      loans,
      rules,
      statuses,
      entries,
    });
    for (const bucket of report.buckets) {
      for (const ob of bucket.obligations) {
        const isCard = bucket.source === "card";
        const isLoan = bucket.source === "loan";
        const icon = isCard
          ? <CreditCard className="size-3.5" />
          : isLoan
            ? <CalendarClock className="size-3.5" />
            : <Landmark className="size-3.5" />;
        const tone = isCard ? "#A78BFA" : isLoan ? "#F87171" : "#60A5FA";
        out.push({
          whenISO: ob.effectiveCashAt,
          label: ob.label,
          sourceLabel: bucket.label,
          amount: -ob.amount,
          positive: false,
          icon,
          tone,
        });
      }
    }

    // 2. Salaries inside the window.
    for (const inc of incomes) {
      if (!inc.active) continue;
      if (inc.amount <= 0) continue;
      const candidate = dateOfDayOfMonth({
        ref: now,
        dayOfMonth: inc.dayOfMonth,
      });
      if (candidate.getTime() > now.getTime() && candidate.getTime() <= horizon.getTime()) {
        out.push({
          whenISO: candidate.toISOString(),
          label: inc.label,
          sourceLabel: "הכנסה",
          amount: inc.amount,
          positive: true,
          icon: <Wallet className="size-3.5" />,
          tone: "#34D399",
        });
      }
      // Also include next month's slot when it still fits the window.
      const next = new Date(candidate);
      next.setMonth(next.getMonth() + 1);
      if (next.getTime() > now.getTime() && next.getTime() <= horizon.getTime()) {
        out.push({
          whenISO: next.toISOString(),
          label: inc.label,
          sourceLabel: "הכנסה",
          amount: inc.amount,
          positive: true,
          icon: <Wallet className="size-3.5" />,
          tone: "#34D399",
        });
      }
    }

    out.sort(
      (a, b) => new Date(a.whenISO).getTime() - new Date(b.whenISO).getTime(),
    );
    return out;
  }, [hydrated, accounts, loans, incomes, rules, statuses, entries]);

  if (!hydrated) return null;

  if (rows.length === 0) {
    return (
      <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
        <SectionHeader icon={<CalendarClock />} title="ציר נזילות 35 ימים" />
        <CardEmpty
          icon={<Receipt className="size-4" />}
          title="אין אירועי נזילות צפויים"
          reason="לא נמצאו חיובים, הוצאות קבועות, הלוואות או הכנסות עתידיות לחלון הקרוב."
          unlockHint="הגדר חשבונות / כרטיסים / הכנסות בהגדרות כדי שהציר ימולא."
        />
      </section>
    );
  }

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <SectionHeader
        icon={<CalendarClock />}
        title="ציר נזילות 35 ימים"
        trailing={
          <span className="text-[10px] text-muted-foreground/70" dir="ltr">
            {rows.length}
          </span>
        }
      />
      <ul className="flex flex-col gap-1.5">
        {rows.map((r, idx) => (
          <motion.li
            key={`${r.whenISO}:${r.label}:${idx}`}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={listReveal(idx)}
            className="flex items-center gap-2.5 rounded-xl border border-white/8 bg-black/25 p-2.5"
          >
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-lg"
              style={{ background: `${r.tone}22`, color: r.tone }}
            >
              {r.icon}
            </span>
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-[12px] font-medium text-foreground">
                {r.label}
              </span>
              <span className="text-[10px] text-muted-foreground/85">
                {r.sourceLabel} · {DAY_FMT.format(new Date(r.whenISO))}
              </span>
            </div>
            <span
              data-mono="true"
              dir="ltr"
              className="shrink-0 text-[13px] font-medium"
              style={{ color: r.positive ? "#34D399" : "#F87171" }}
            >
              {r.positive ? "+" : "−"}
              {ILS.format(Math.abs(r.amount))}
            </span>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

function dateOfDayOfMonth(args: { ref: Date; dayOfMonth: number }): Date {
  const ref = args.ref;
  const lastDay = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
  const day = Math.min(Math.max(1, args.dayOfMonth), lastDay);
  return new Date(ref.getFullYear(), ref.getMonth(), day, 12, 0, 0);
}
