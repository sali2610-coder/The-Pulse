"use client";

// Spend consistency score. Low coefficient of variation (CV) =
// predictable spending the daily-allowance budget can rely on.
// High CV = burst-y spending where a single Friday wipes the
// week. Auto-hides when there's no spend yet.

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Activity } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { spendConsistency, type ConsistencyRating } from "@/lib/spend-consistency";
import { currentMonthKey } from "@/lib/dates";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const TONE: Record<ConsistencyRating, string> = {
  even: "#34D399",
  steady: "#FCD34D",
  uneven: "#F5A742",
  burst: "#F87171",
};

const LABEL: Record<ConsistencyRating, string> = {
  even: "אחיד",
  steady: "יציב",
  uneven: "לא אחיד",
  burst: "פרצי",
};

export function SpendConsistencyCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const c = useMemo(() => {
    if (!hydrated) return null;
    const now = new Date();
    return spendConsistency({
      entries,
      monthKey: currentMonthKey(),
      uptoDay: now.getDate(),
    });
  }, [hydrated, entries]);

  if (!hydrated || !c || c.mean === 0) return null;

  const tone = TONE[c.rating];

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <header className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Activity className="size-3 text-[color:var(--neon)]" />
          עקביות הוצאה
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: `${tone}22`, color: tone }}
        >
          {LABEL[c.rating]}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="flex flex-col gap-0.5 rounded-2xl border border-white/8 bg-black/25 p-3">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            ממוצע יומי
          </span>
          <span
            data-mono="true"
            dir="ltr"
            className="text-[16px] font-semibold text-foreground"
          >
            {ILS.format(c.mean)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 rounded-2xl border border-white/8 bg-black/25 p-3">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            שיא יומי
          </span>
          <span
            data-mono="true"
            dir="ltr"
            className="text-[16px] font-semibold"
            style={{ color: tone }}
          >
            {ILS.format(c.maxDay)}
          </span>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35 }}
        className="flex items-center justify-between gap-2 rounded-2xl border border-white/8 bg-black/20 px-3 py-2 text-[10.5px] text-muted-foreground"
        dir="ltr"
        data-mono="true"
      >
        <span>cv {c.cv.toFixed(2)}</span>
        <span>
          {c.spendingDays} ימים פעילים / {c.daysInWindow}
        </span>
      </motion.div>

      <p className="text-[10px] text-muted-foreground/80">
        CV נמוך = הוצאה יומית קבועה. גבוה = הוצאה פרצית — תקציב יומי
        פחות אמין.
      </p>
    </section>
  );
}
