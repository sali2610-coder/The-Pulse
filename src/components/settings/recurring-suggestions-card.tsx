"use client";

// Recurring-rule auto-suggestions. Lives next to the manual
// RecurringRulesPanel in Settings. One-tap "promote" creates a
// RecurringRule directly from the suggestion via the store
// action. Auto-hides when no candidate meets the 3-month / ±15%
// threshold.

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { useFinanceStore } from "@/lib/store";
import { detectRecurringSuggestions } from "@/lib/recurring-suggestions";
import { tap, success } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const DISMISS_KEY = "sally.suggestions.dismissed.v1";

function readDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed as string[]);
  } catch {
    return new Set();
  }
}

function writeDismissed(set: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      DISMISS_KEY,
      JSON.stringify(Array.from(set)),
    );
  } catch {
    /* ignore */
  }
}

export function RecurringSuggestionsCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const addRule = useFinanceStore((s) => s.addRule);

  const [dismissed, setDismissed] = useState<Set<string>>(() =>
    readDismissed(),
  );

  const suggestions = useMemo(() => {
    if (!hydrated) return [];
    const raw = detectRecurringSuggestions({ entries, rules });
    return raw.filter((s) => !dismissed.has(s.merchantKey));
  }, [hydrated, entries, rules, dismissed]);

  if (!hydrated || suggestions.length === 0) return null;

  const promote = (s: (typeof suggestions)[number]) => {
    tap();
    addRule({
      label: s.label,
      category: s.category,
      estimatedAmount: s.estimatedAmount,
      dayOfMonth: s.dayOfMonth,
      keywords: [s.label],
    });
    success();
    toast.success(`חוקיות נוצרה: ${s.label}`);
  };

  const dismiss = (key: string) => {
    tap();
    const next = new Set(dismissed);
    next.add(key);
    writeDismissed(next);
    setDismissed(next);
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-surface/50 p-5 backdrop-blur-md">
      <header className="mb-3 flex items-center gap-2">
        <Sparkles className="size-4 text-gold" />
        <div className="flex flex-col leading-tight">
          <span className="text-[11px] uppercase tracking-[0.22em] text-foreground/85">
            הצעות לחוקיות
          </span>
          <span className="text-[10px] text-muted-foreground">
            דפוסים שמופיעים שוב ושוב — שווה להפוך אותם להוצאות קבועות
          </span>
        </div>
      </header>

      <ul className="flex flex-col gap-2">
        {suggestions.slice(0, 6).map((s, idx) => (
          <motion.li
            key={s.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.04, duration: 0.22 }}
            className="flex items-center gap-2 rounded-2xl border border-white/8 bg-black/25 p-2.5 text-[11px]"
          >
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-foreground">{s.label}</span>
              <span
                className="text-[10px] text-muted-foreground"
                dir="ltr"
                data-mono="true"
              >
                {ILS.format(s.estimatedAmount)} · ב־{s.dayOfMonth} ·{" "}
                {s.observedMonths} חודשים
              </span>
            </div>
            <button
              type="button"
              onClick={() => promote(s)}
              aria-label={`צור חוקיות עבור ${s.label}`}
              className="flex h-7 items-center gap-1 rounded-md border border-[color:var(--neon)]/40 bg-[color:var(--neon)]/10 px-2 text-[10px] text-[color:var(--neon)] hover:bg-[color:var(--neon)]/20"
            >
              <Plus className="size-3" />
              צור
            </button>
            <button
              type="button"
              onClick={() => dismiss(s.merchantKey)}
              aria-label={`בטל הצעה עבור ${s.label}`}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-background/40 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
