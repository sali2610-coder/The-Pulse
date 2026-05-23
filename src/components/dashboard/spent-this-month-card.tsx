"use client";

// "הוצאתי החודש" — single-glance answer to the most common user
// question. INDEPENDENT of bank-account balance, anchors, loans,
// income. Sum of actual outflow slices charged this month only.

import { useMemo } from "react";
import { motion } from "framer-motion";
import { TrendingDown } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { monthlySpent } from "@/lib/monthly-spent";
import { SectionHeader } from "@/components/ui/section-header";
import { InsightChip } from "@/components/ui/insight-chip";
import { SPRING_SOFT } from "@/lib/motion-tokens";
import { AnimatedCounter } from "@/components/ui/animated-counter";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const MONTH_FMT = new Intl.DateTimeFormat("he-IL", { month: "long" });

export function SpentThisMonthCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const data = useMemo(() => {
    if (!hydrated) return null;
    return monthlySpent({ entries });
  }, [hydrated, entries]);

  if (!hydrated || !data) return null;
  const [y, m] = data.monthKey.split("-").map(Number);
  const monthLabel = MONTH_FMT.format(new Date(y, (m ?? 1) - 1, 1));

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_SOFT}
      className="glass-card flex flex-col gap-2 rounded-3xl p-4"
    >
      <SectionHeader
        icon={<TrendingDown />}
        title="הוצאתי החודש"
        trailing={
          <InsightChip severity="info" label={monthLabel} />
        }
      />
      <div className="flex items-baseline gap-2">
        <span
          data-mono="true"
          dir="ltr"
          className="text-[32px] font-light leading-none text-foreground"
        >
          <AnimatedCounter value={data.spentSoFar} format={(v) => ILS.format(v)} />
        </span>
        {data.charges > 0 ? (
          <span className="text-[11px] text-muted-foreground/85">
            על פני {data.charges} חיובים
          </span>
        ) : null}
      </div>
      {data.refundCredit > 0 ? (
        <p className="text-[11px] text-[#34D399]">
          + זיכויים החודש {ILS.format(data.refundCredit)}
        </p>
      ) : null}
      <p className="text-[10.5px] text-muted-foreground/80">
        סכום זה לא תלוי ביתרת הבנק. רק חיובים שנכנסו בפועל מתחילת החודש.
      </p>
    </motion.section>
  );
}
