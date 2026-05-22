"use client";

// Aggregate commitment burden surface — "all installment plans +
// loans, what's left, when is the user free". Auto-hides when no
// bounded plan is active. Lives in "תזרים עתידי".

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Hourglass, Layers } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { commitmentBurden } from "@/lib/commitment-burden";
import { currentMonthKey } from "@/lib/dates";
import { EASE_OUT_EXPO, STAGGER_TIGHT } from "@/lib/motion-tokens";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const MONTH_FMT = new Intl.DateTimeFormat("he-IL", {
  month: "long",
  year: "numeric",
});

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return MONTH_FMT.format(new Date(Number(y), Number(m) - 1, 1));
}

export function CommitmentBurdenCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const loans = useFinanceStore((s) => s.loans);
  const rules = useFinanceStore((s) => s.rules);

  const burden = useMemo(() => {
    if (!hydrated) return null;
    return commitmentBurden({ loans, rules, monthKey: currentMonthKey() });
  }, [hydrated, loans, rules]);

  if (!hydrated || !burden || burden.plansActive === 0) return null;

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <header className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Layers className="size-3 text-[color:var(--neon)]" />
          סך התחייבויות
        </span>
        <span className="text-[10px] text-muted-foreground/80">
          {burden.plansActive} פלאנים פעילים
        </span>
      </header>

      <div className="flex items-baseline justify-between gap-3">
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            נותר לשלם
          </span>
          <span
            data-mono="true"
            dir="ltr"
            className="text-[20px] font-semibold text-destructive"
          >
            {ILS.format(burden.totalRemaining)}
          </span>
        </div>
        <div className="flex flex-col items-end leading-tight">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            תשלום חודשי מצרפי
          </span>
          <span
            data-mono="true"
            dir="ltr"
            className="text-[14px] text-muted-foreground"
          >
            {ILS.format(burden.monthlyOutflow)}
          </span>
        </div>
      </div>

      {burden.longestEndMonth ? (
        <div className="flex items-center gap-1.5 rounded-2xl border border-white/8 bg-black/25 px-3 py-2 text-[11px] text-muted-foreground">
          <Hourglass className="size-3 text-gold" />
          <span>תשלום אחרון: {monthLabel(burden.longestEndMonth)}</span>
        </div>
      ) : null}

      <ul className="flex flex-col gap-1.5">
        {burden.items.slice(0, 5).map((it, idx) => (
          <motion.li
            key={it.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: idx * STAGGER_TIGHT,
              duration: 0.25,
              ease: EASE_OUT_EXPO,
            }}
            className="flex items-center justify-between gap-2 rounded-2xl border border-white/8 bg-black/20 px-3 py-2 text-[11px]"
          >
            <div className="flex flex-col leading-tight">
              <span className="text-foreground">{it.label}</span>
              <span className="text-[10px] text-muted-foreground">
                {it.kind === "loan" ? "הלוואה" : "תשלומים"} ·{" "}
                {it.remainingPayments} נותרו
              </span>
            </div>
            <span data-mono="true" dir="ltr" className="text-foreground/85">
              {ILS.format(it.remainingTotal)}
            </span>
          </motion.li>
        ))}
      </ul>

      <p className="text-[10px] text-muted-foreground/80">
        תשלום חודשי × תשלומים שנותרו. הלוואות פתוחות ללא תאריך סיום לא נכללות.
      </p>
    </section>
  );
}
