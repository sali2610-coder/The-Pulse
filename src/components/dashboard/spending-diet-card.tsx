"use client";

// Spending-diet card. Surfaces the top categories where the user can
// realistically reduce spend (flexible + risky), with a short Hebrew
// recommendation per row. Auto-hides until we have at least one row
// with prior history.

import { useMemo } from "react";
import { Scissors } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { spendingDiet, type DietClass } from "@/lib/spending-diet";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const CLASS_TONE: Record<DietClass, string> = {
  essential: "#A1A1AA",
  flexible: "#34D399",
  risky: "#F87171",
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
      <header className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Scissors className="size-3 text-[color:var(--neon)]" />
          איפה אפשר לחתוך
        </span>
        {diet.potentialSavings > 0 ? (
          <span
            className="rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-[0.18em]"
            style={{ background: "#34D39922", color: "#34D399" }}
            dir="ltr"
          >
            פוטנציאל {ILS.format(diet.potentialSavings)}
          </span>
        ) : null}
      </header>

      <ul className="flex flex-col gap-1.5">
        {actionable.map((row) => {
          const tone = CLASS_TONE[row.classification];
          return (
            <li
              key={row.category}
              className="flex flex-col gap-1 rounded-2xl border border-white/8 bg-black/25 p-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] font-medium text-foreground">
                    {row.label}
                  </span>
                  <span
                    className="rounded-md px-1.5 py-0.5 text-[9px]"
                    style={{ background: `${tone}1a`, color: tone }}
                  >
                    {CLASS_LABEL[row.classification]}
                  </span>
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
            </li>
          );
        })}
      </ul>
    </section>
  );
}
