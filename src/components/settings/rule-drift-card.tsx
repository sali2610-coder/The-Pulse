"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUp, Check, Wand2, X } from "lucide-react";
import { toast } from "sonner";

import { useFinanceStore } from "@/lib/store";
import { detectRuleDrift } from "@/lib/rule-drift";
import { currentMonthKey } from "@/lib/dates";
import { success, tap } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const TONES = {
  alert: { fg: "#F87171", border: "border-[#F87171]/40", bg: "bg-[#F87171]/8" },
  watch: { fg: "#D4AF37", border: "border-[#D4AF37]/40", bg: "bg-[#D4AF37]/8" },
} as const;

/**
 * Surfaces recurring rules whose `estimatedAmount` materially diverges
 * from the actual matched charges. One-tap "עדכן ל־₪X" promotes the
 * suggested estimate (median of recent paid months) into the rule.
 */
export function RuleDriftCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const rules = useFinanceStore((s) => s.rules);
  const entries = useFinanceStore((s) => s.entries);
  const statuses = useFinanceStore((s) => s.statuses);
  const updateRule = useFinanceStore((s) => s.updateRule);

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const drifts = useMemo(() => {
    if (!hydrated) return [];
    return detectRuleDrift({
      rules,
      entries,
      statuses,
      monthKey: currentMonthKey(),
    });
  }, [hydrated, rules, entries, statuses]);

  const visible = drifts.filter((d) => !dismissed.has(d.ruleId));

  if (!hydrated) return null;
  if (visible.length === 0) return null;

  function adopt(d: (typeof drifts)[number]) {
    tap();
    updateRule(d.ruleId, { estimatedAmount: d.suggestedEstimate });
    success();
    toast.success("האומדן עודכן", {
      description: `${d.label} → ${ILS.format(d.suggestedEstimate)}`,
    });
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(d.ruleId);
      return next;
    });
  }

  function dismiss(ruleId: string) {
    tap();
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(ruleId);
      return next;
    });
  }

  return (
    <section
      data-section="rule-drift"
      className="rounded-2xl border border-[#D4AF37]/30 bg-surface/50 p-5 backdrop-blur-md"
    >
      <header className="mb-3 flex items-center gap-2">
        <Wand2 className="size-4 text-gold" />
        <div>
          <div className="text-[11px] uppercase tracking-[0.25em] text-gold">
            אומדן לא תואם
          </div>
          <div className="text-[11px] text-muted-foreground">
            חוקים שהחיוב בפועל סוטה מהאומדן באופן מהותי
          </div>
        </div>
      </header>

      <ul className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {visible.map((d) => {
            const tone = TONES[d.severity];
            const Arrow = d.direction === "up" ? ArrowUp : ArrowDown;
            const ratioPct = `${Math.round((d.ratio - 1) * 100)}%`;
            const ratioLabel = d.direction === "up" ? `+${ratioPct}` : ratioPct;
            return (
              <motion.li
                key={d.ruleId}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className={`flex items-center gap-3 rounded-2xl border p-3 ${tone.border} ${tone.bg}`}
              >
                <div
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: `${tone.fg}22`, color: tone.fg }}
                >
                  <Arrow className="size-4" strokeWidth={1.8} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[12.5px] font-medium text-foreground">
                      {d.label}
                    </span>
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                      style={{ background: `${tone.fg}22`, color: tone.fg }}
                      dir="ltr"
                    >
                      {ratioLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                    <span data-mono="true" dir="ltr">
                      אומדן {ILS.format(d.estimatedAmount)} → בפועל{" "}
                      {ILS.format(d.currentActual)}
                    </span>
                    <span>·</span>
                    <span>{d.monthsCovered} חודשי בסיס</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => adopt(d)}
                    className="flex h-8 items-center gap-1 rounded-lg border border-gold/50 bg-gold/10 px-2.5 text-[11px] font-medium text-gold transition-colors hover:bg-gold/20"
                  >
                    <Check className="size-3" />
                    עדכן ל־{ILS.format(d.suggestedEstimate)}
                  </button>
                  <button
                    type="button"
                    onClick={() => dismiss(d.ruleId)}
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
