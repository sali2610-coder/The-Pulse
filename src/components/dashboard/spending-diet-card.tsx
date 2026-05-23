"use client";

// Spending-diet card. Surfaces the top categories where the user can
// realistically reduce spend (flexible + risky), with a short Hebrew
// recommendation per row. Auto-hides until we have at least one row
// with prior history.

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Scissors } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { spendingDiet, type DietClass } from "@/lib/spending-diet";
import { SectionHeader } from "@/components/ui/section-header";
import {
  InsightChip,
  type InsightSeverity,
} from "@/components/ui/insight-chip";
import { listReveal } from "@/lib/motion-tokens";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const CLASS_SEV: Record<DietClass, InsightSeverity> = {
  essential: "info",
  flexible: "info",
  risky: "warn",
};

const CLASS_LABEL: Record<DietClass, string> = {
  essential: "חיוני",
  flexible: "גמיש",
  risky: "סיכון צמיחה",
};

export function SpendingDietCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const diet = useMemo(() => {
    if (!hydrated) return null;
    return spendingDiet({ entries });
  }, [hydrated, entries]);

  if (!hydrated || !diet) return null;

  // Show only rows where a reduction is actionable. Hide essentials
  // unless they're the only thing we have AND we have at least one
  // observation. If nothing actionable surfaces, the card auto-hides.
  const actionable = diet.rows
    .filter((r) => r.classification !== "essential")
    .filter((r) => r.projectedEOM > 0)
    .slice(0, 5);

  if (actionable.length === 0) return null;

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <SectionHeader
        icon={<Scissors />}
        title="איפה אפשר לחתוך"
        trailing={
          diet.potentialSavings > 0 ? (
            <InsightChip
              severity="info"
              label="פוטנציאל"
              value={ILS.format(diet.potentialSavings)}
            />
          ) : null
        }
      />

      <ul className="flex flex-col gap-1.5">
        {actionable.map((row, idx) => (
          <motion.li
            key={row.category}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={listReveal(idx)}
            className="flex flex-col gap-1 rounded-2xl border border-white/8 bg-black/25 p-2.5 transition-colors hover:border-white/14"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-medium text-foreground">
                  {row.label}
                </span>
                <InsightChip
                  severity={CLASS_SEV[row.classification]}
                  label={CLASS_LABEL[row.classification]}
                />
              </div>
              {row.suggestedTarget !== null ? (
                <span
                  data-mono="true"
                  dir="ltr"
                  className="text-[11px] text-muted-foreground"
                >
                  יעד {ILS.format(row.suggestedTarget)} ·{" "}
                  <span className="text-foreground">
                    צפוי {ILS.format(row.projectedEOM)}
                  </span>
                </span>
              ) : null}
            </div>
            <p className="text-[10.5px] leading-snug text-muted-foreground/85">
              {row.recommendation}
            </p>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
