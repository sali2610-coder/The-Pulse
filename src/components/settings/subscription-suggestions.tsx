"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { useFinanceStore } from "@/lib/store";
import { detectSubscriptionCandidates } from "@/lib/subscription-detector";
import { getCategory } from "@/lib/categories";
import { tap, success } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const CONFIDENCE_LABEL = {
  high: "ביטחון גבוה",
  medium: "ביטחון בינוני",
  low: "ביטחון נמוך",
} as const;

const CONFIDENCE_TONE = {
  high: "#34D399",
  medium: "#D4AF37",
  low: "#A1A1AA",
} as const;

/**
 * Surfaces auto-detected monthly subscriptions that don't yet have a
 * RecurringRule. One tap on "צור חוק" promotes a candidate into a
 * real rule. Dismissals are session-only (no persisted ignore list)
 * to keep state lean — once the user creates the rule, the candidate
 * vanishes naturally on next render.
 */
export function SubscriptionSuggestions() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const addRule = useFinanceStore((s) => s.addRule);

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const candidates = useMemo(() => {
    if (!hydrated) return [];
    return detectSubscriptionCandidates({ entries, rules });
  }, [hydrated, entries, rules]);

  const visible = candidates.filter((c) => !dismissed.has(c.merchantKey));

  if (!hydrated) return null;
  if (visible.length === 0) return null;

  function promote(c: (typeof candidates)[number]) {
    tap();
    addRule({
      label: c.displayName,
      category: c.suggestedCategory,
      estimatedAmount: c.suggestedAmount,
      dayOfMonth: c.suggestedDay,
      keywords: [c.merchantKey],
      paymentSource: "card",
    });
    success();
    toast.success("נוצר חוק קבוע", { description: c.displayName });
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(c.merchantKey);
      return next;
    });
  }

  function dismiss(mKey: string) {
    tap();
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(mKey);
      return next;
    });
  }

  return (
    <section className="rounded-2xl border border-neon/30 bg-surface/50 p-5 backdrop-blur-md">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-neon" />
          <div>
            <div className="text-[11px] uppercase tracking-[0.25em] text-neon">
              פעימות שזוהו
            </div>
            <div className="text-[11px] text-muted-foreground">
              חיובים חודשיים חוזרים שעדיין לא הוגדרו כקבועים
            </div>
          </div>
        </div>
      </header>

      <ul className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {visible.map((c) => {
            const cat = getCategory(c.suggestedCategory);
            const Icon = cat.icon;
            const tone = CONFIDENCE_TONE[c.confidence];
            return (
              <motion.li
                key={c.merchantKey}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className="flex items-center gap-3 rounded-2xl border border-white/8 bg-black/30 p-3"
              >
                <div
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl"
                  style={{
                    background: `${cat.accent}22`,
                    color: cat.accent,
                  }}
                >
                  <Icon className="size-4" strokeWidth={1.7} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-foreground">
                      {c.displayName}
                    </span>
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                      style={{ background: `${tone}22`, color: tone }}
                    >
                      {CONFIDENCE_LABEL[c.confidence]}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                    <span data-mono="true" dir="ltr">
                      {ILS.format(c.suggestedAmount)} / חודש
                    </span>
                    <span>·</span>
                    <span>ב־{c.suggestedDay} בחודש</span>
                    <span>·</span>
                    <span>{c.occurrenceCount} חיובים</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => promote(c)}
                    className="flex h-8 items-center gap-1 rounded-lg border border-neon/50 bg-neon/10 px-2.5 text-[11px] font-medium text-neon transition-colors hover:bg-neon/20"
                  >
                    <Plus className="size-3" />
                    צור חוק
                  </button>
                  <button
                    type="button"
                    onClick={() => dismiss(c.merchantKey)}
                    aria-label="התעלם"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-background/40 text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </section>
  );
}
