"use client";

// Essentials vs discretionary split. Auto-hides on a quiet
// month. Different from CategoryBreakdown (per-category bars);
// this card collapses categories into the two-bucket lens
// fintech users compare against.

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Scale } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { spendSplit } from "@/lib/spend-split";
import { currentMonthKey } from "@/lib/dates";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export function SpendSplitCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const s = useMemo(() => {
    if (!hydrated) return null;
    return spendSplit({ entries, monthKey: currentMonthKey() });
  }, [hydrated, entries]);

  if (!hydrated || !s || s.total === 0) return null;

  const essPct = Math.round(s.essentialShare * 100);
  const discPct = 100 - essPct;

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <header className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Scale className="size-3 text-[color:var(--neon)]" />
          הכרחי מול בחירה
        </span>
        <span
          data-mono="true"
          dir="ltr"
          className="text-[10px] text-muted-foreground/80"
        >
          {ILS.format(s.total)} סה״כ
        </span>
      </header>

      {/* Two-bucket bar */}
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${essPct}%` }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          style={{
            background: "linear-gradient(90deg, #34D399, #34D39966)",
          }}
        />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${discPct}%` }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          style={{
            background: "linear-gradient(90deg, #D4AF37, #D4AF3766)",
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/25 px-3 py-2">
          <span className="text-foreground">הכרחי</span>
          <span
            className="font-semibold"
            style={{ color: "#34D399" }}
            data-mono="true"
            dir="ltr"
          >
            {ILS.format(s.essentials)} · {essPct}%
          </span>
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/25 px-3 py-2">
          <span className="text-foreground">בחירה</span>
          <span
            className="font-semibold"
            style={{ color: "#D4AF37" }}
            data-mono="true"
            dir="ltr"
          >
            {ILS.format(s.discretionary)} · {discPct}%
          </span>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground/80">
        הכרחי = אוכל, תחבורה, חשבונות, בריאות, חינוך. בחירה = קניות,
        בילויים, מתנות, אחר.
      </p>
    </section>
  );
}
