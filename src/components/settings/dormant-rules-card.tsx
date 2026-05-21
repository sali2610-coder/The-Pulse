"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Moon, Power, X } from "lucide-react";
import { toast } from "sonner";

import { useFinanceStore } from "@/lib/store";
import { detectDormantRules } from "@/lib/rule-dormancy";
import { currentMonthKey } from "@/lib/dates";
import { success, tap } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

function formatMonthKey(monthKey?: string): string {
  if (!monthKey) return "מעולם לא";
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  const months = [
    "ינואר",
    "פברואר",
    "מרץ",
    "אפריל",
    "מאי",
    "יוני",
    "יולי",
    "אוגוסט",
    "ספטמבר",
    "אוקטובר",
    "נובמבר",
    "דצמבר",
  ];
  return `${months[m - 1]} ${y}`;
}

/**
 * Surfaces active recurring rules that haven't been paid in the last
 * 3+ months. They keep inflating `pendingFixed` in the CFO forecast
 * even though no charge will arrive. One-tap "כבה" toggles the rule
 * off (preserves data — toggleRule, not deleteRule).
 */
export function DormantRulesCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const toggleRule = useFinanceStore((s) => s.toggleRule);

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const dormant = useMemo(() => {
    if (!hydrated) return [];
    return detectDormantRules({
      rules,
      statuses,
      monthKey: currentMonthKey(),
    });
  }, [hydrated, rules, statuses]);

  const visible = dormant.filter((d) => !dismissed.has(d.ruleId));

  if (!hydrated) return null;
  if (visible.length === 0) return null;

  const totalDrag = visible.reduce((s, d) => s + d.estimatedAmount, 0);

  function turnOff(ruleId: string, label: string) {
    tap();
    toggleRule(ruleId);
    success();
    toast.success("הוצאה הקבועה הושבתה", { description: label });
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(ruleId);
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
    <section className="rounded-2xl border border-white/20 bg-surface/50 p-5 backdrop-blur-md">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Moon className="size-4 text-muted-foreground" />
          <div>
            <div className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
              חוקים רדומים
            </div>
            <div className="text-[11px] text-muted-foreground/80">
              לא חויבו בשלושה חודשים — ממשיכים להעמיס על תחזית
            </div>
          </div>
        </div>
        <div className="text-[10px] text-muted-foreground" dir="ltr">
          {ILS.format(totalDrag)} / חודש
        </div>
      </header>

      <ul className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {visible.map((d) => (
            <motion.li
              key={d.ruleId}
              layout
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 8 }}
              className="flex items-center gap-3 rounded-2xl border border-white/8 bg-black/30 p-3"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/8 text-muted-foreground">
                <Moon className="size-4" strokeWidth={1.7} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-[12.5px] font-medium text-foreground">
                  {d.label}
                </span>
                <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                  <span data-mono="true" dir="ltr">
                    {ILS.format(d.estimatedAmount)} / חודש
                  </span>
                  <span>·</span>
                  <span>שולם לאחרונה: {formatMonthKey(d.lastPaidMonthKey)}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => turnOff(d.ruleId, d.label)}
                  className="flex h-8 items-center gap-1 rounded-lg border border-white/20 bg-background/40 px-2.5 text-[11px] font-medium text-foreground transition-colors hover:border-white/40"
                >
                  <Power className="size-3" />
                  כבה
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
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}
