"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Radar, Plus, Check } from "lucide-react";
import { toast } from "sonner";

import { useFinanceStore } from "@/lib/store";
import { detectSubscriptionCandidates } from "@/lib/subscriptions";
import { getCategory } from "@/lib/categories";
import { tap, soft } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export function SubscriptionRadarCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const addRule = useFinanceStore((s) => s.addRule);

  /** Locally-dismissed candidates so they hide instantly without waiting for
   *  the store to commit. After a successful addRule the radar refreshes
   *  via store update anyway. */
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const candidates = useMemo(() => {
    if (!hydrated) return [];
    return detectSubscriptionCandidates({ entries, rules })
      .filter((c) => !dismissed.has(c.key))
      .slice(0, 4);
  }, [hydrated, entries, rules, dismissed]);

  if (!hydrated || candidates.length === 0) return null;

  function approve(key: string) {
    const c = candidates.find((x) => x.key === key);
    if (!c) return;
    soft();
    addRule({
      label: c.merchant,
      category: c.category,
      estimatedAmount: c.estimatedAmount,
      dayOfMonth: c.dayOfMonth,
      keywords: c.keywords,
    });
    setDismissed((s) => new Set(s).add(key));
    toast.success(`נוספה כלל קבוע: ${c.merchant}`);
  }

  function dismiss(key: string) {
    tap();
    setDismissed((s) => new Set(s).add(key));
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.16, duration: 0.4 }}
      className="glass-card flex flex-col gap-3 rounded-3xl p-5"
    >
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[color:#A78BFA]/15 text-[#A78BFA]">
          <Radar className="h-5 w-5" strokeWidth={1.6} />
        </span>
        <div className="flex flex-col">
          <span className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            סורק מנויים
          </span>
          <span className="text-base font-semibold text-foreground">
            תבניות חדשות שזיהינו
          </span>
        </div>
      </header>

      <ul className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {candidates.map((c) => {
            const meta = getCategory(c.category);
            const Icon = meta.icon;
            return (
              <motion.li
                key={c.key}
                layout
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12, height: 0 }}
                className="flex items-center gap-3 rounded-2xl border border-white/8 bg-surface/50 p-3"
              >
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{
                    background: `${meta.accent}1f`,
                    color: meta.accent,
                  }}
                >
                  <Icon className="h-5 w-5" strokeWidth={1.6} />
                </span>
                <div className="flex flex-1 flex-col gap-0.5">
                  <span className="line-clamp-1 text-sm font-medium text-foreground">
                    {c.merchant}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {c.observations} חודשים · יום {c.dayOfMonth}
                  </span>
                </div>
                <span
                  dir="ltr"
                  data-mono="true"
                  className="text-sm font-semibold text-foreground"
                >
                  {ILS.format(c.estimatedAmount)}
                </span>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => approve(c.key)}
                    aria-label={`הוסף כלל ל-${c.merchant}`}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#34D399]/40 bg-[#34D399]/10 text-[#34D399] transition-colors hover:bg-[#34D399]/15"
                  >
                    <Check className="h-4 w-4" strokeWidth={2.2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => dismiss(c.key)}
                    aria-label={`התעלם מתבנית של ${c.merchant}`}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-surface/70 text-muted-foreground transition-colors hover:bg-surface"
                  >
                    <Plus className="h-4 w-4 rotate-45" strokeWidth={2.2} />
                  </button>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      <p className="text-[10px] text-muted-foreground">
        הקש על ✓ כדי להוסיף ככלל אוטומטי. ה־Pulse ישדך אליו חיובים עתידיים
        בעצמו.
      </p>
    </motion.section>
  );
}
