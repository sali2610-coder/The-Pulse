"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { useFinanceStore } from "@/lib/store";
import { recommendBudget } from "@/lib/budget-recommendation";
import { currentMonthKey } from "@/lib/dates";
import { success, tap } from "@/lib/haptics";
import {
  dismissInsight,
  isInsightDismissed,
  pruneExpiredDismissals,
} from "@/lib/insight-dismiss";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

/**
 * Surfaces a data-backed monthlyBudget proposal. Renders only when:
 *   - User has at least 2 complete months of history, AND
 *   - Either the current budget is 0/unset OR diverges from the
 *     recommendation by ≥ 30%.
 * One tap on "אמץ ₪X" calls `setMonthlyBudget`.
 */
export function BudgetRecommendationCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);
  const setMonthlyBudget = useFinanceStore((s) => s.setMonthlyBudget);

  const [dismissedTick, setDismissedTick] = useState(0);

  useEffect(() => {
    pruneExpiredDismissals();
  }, []);

  const rec = useMemo(() => {
    if (!hydrated) return null;
    return recommendBudget({ entries, monthKey: currentMonthKey() });
  }, [hydrated, entries]);

  if (!hydrated || !rec || !rec.hasEnoughData) return null;
  if (rec.recommended <= 0) return null;

  // Key the dismissal on the rounded recommendation so a new
  // recommendation amount (e.g., user spending pattern shifted)
  // surfaces a fresh suggestion even if the previous one was
  // dismissed.
  const dismissKey = String(rec.recommended);
  void dismissedTick;
  if (isInsightDismissed("budget-recommendation", dismissKey)) return null;

  const isZero = monthlyBudget <= 0;
  const drift = monthlyBudget > 0
    ? Math.abs(rec.recommended - monthlyBudget) / monthlyBudget
    : Infinity;
  if (!isZero && drift < 0.3) return null;

  function adopt() {
    if (!rec) return;
    tap();
    setMonthlyBudget(rec.recommended);
    success();
    toast.success("יעד התקציב עודכן", {
      description: ILS.format(rec.recommended),
    });
    dismissInsight("budget-recommendation", dismissKey);
    setDismissedTick((t) => t + 1);
  }

  function dismiss() {
    tap();
    dismissInsight("budget-recommendation", dismissKey);
    setDismissedTick((t) => t + 1);
  }

  const headline = isZero ? "הצעת תקציב" : "תקציב לא תואם להוצאות בפועל";
  const subtitle = isZero
    ? `לפי ${rec.lookbackMonths} חודשים אחרונים`
    : `הוצאת בממוצע ${ILS.format(rec.monthAvg)} מול תקציב ${ILS.format(monthlyBudget)}`;

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      data-section="budget-recommendation"
      className="rounded-2xl border border-neon/30 bg-surface/50 p-5 backdrop-blur-md"
    >
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-neon" />
          <div>
            <div className="text-[11px] uppercase tracking-[0.25em] text-neon">
              {headline}
            </div>
            <div className="text-[11px] text-muted-foreground">{subtitle}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="התעלם"
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-background/40 text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      </header>

      <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-black/30 p-3">
        <div className="flex flex-1 flex-col leading-tight">
          <div className="flex items-baseline gap-1.5" dir="ltr">
            <span
              data-mono="true"
              className="text-2xl font-light text-foreground"
            >
              {ILS.format(rec.recommended)}
            </span>
            <span className="text-[10px] text-muted-foreground">
              / חודש
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
            <span data-mono="true" dir="ltr">
              ממוצע {ILS.format(rec.monthAvg)} · חציון {ILS.format(rec.monthMedian)}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={adopt}
          className="flex h-9 items-center gap-1 rounded-lg border border-neon/50 bg-neon/10 px-3 text-[12px] font-medium text-neon transition-colors hover:bg-neon/20"
        >
          <Check className="size-3.5" />
          אמץ
        </button>
      </div>
    </motion.section>
  );
}
