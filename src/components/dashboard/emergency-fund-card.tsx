"use client";

// Emergency-fund progress card. Shows: 3-month outflow baseline,
// recommended cushion, current liquid, progress %, months
// covered. Auto-hides when there's no baseline to recommend from.

import { useMemo } from "react";
import { motion } from "framer-motion";
import { LifeBuoy } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import {
  emergencyFundReport,
  type EmergencyFundReport,
} from "@/lib/emergency-fund";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const TONE: Record<EmergencyFundReport["rating"], string> = {
  none: "#A1A1AA",
  low: "#F87171",
  watch: "#D4AF37",
  ok: "#FCD34D",
  excellent: "#34D399",
};

const LABEL: Record<EmergencyFundReport["rating"], string> = {
  none: "אין בסיס",
  low: "נמוך",
  watch: "ראוי לעקוב",
  ok: "כמעט שם",
  excellent: "מעולה",
};

export function EmergencyFundCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const entries = useFinanceStore((s) => s.entries);

  const report = useMemo(() => {
    if (!hydrated) return null;
    return emergencyFundReport({ accounts, entries });
  }, [hydrated, accounts, entries]);

  if (!hydrated || !report) return null;
  if (report.baselineMonthly === 0) return null;

  const tone = TONE[report.rating];
  const pct = Math.round(report.progress * 100);

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <header className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <LifeBuoy className="size-3 text-[color:var(--neon)]" />
          קרן חירום
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: `${tone}22`, color: tone }}
        >
          {LABEL[report.rating]}
        </span>
      </header>

      <div className="flex items-baseline justify-between gap-3">
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            יש לי
          </span>
          <span
            data-mono="true"
            dir="ltr"
            className="text-[18px] font-semibold text-foreground"
          >
            {ILS.format(report.currentLiquid)}
          </span>
        </div>
        <div className="flex flex-col items-end leading-tight">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            יעד · {report.targetMonths} חודשים
          </span>
          <span
            data-mono="true"
            dir="ltr"
            className="text-[14px] text-muted-foreground"
          >
            {ILS.format(report.targetAmount)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/5">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-y-0 start-0 rounded-full"
            style={{
              background: `linear-gradient(90deg, ${tone}, ${tone}66)`,
            }}
          />
        </div>
        <span
          data-mono="true"
          dir="ltr"
          className="w-10 shrink-0 text-end text-[11px]"
          style={{ color: tone }}
        >
          {pct}%
        </span>
      </div>

      <div
        className="flex items-center justify-between gap-2 rounded-2xl border border-white/8 bg-black/25 px-3 py-2 text-[11px] text-muted-foreground"
        dir="ltr"
        data-mono="true"
      >
        <span>בסיס {ILS.format(report.baselineMonthly)} / חודש</span>
        <span>
          ≈{" "}
          {Number.isFinite(report.monthsCovered)
            ? report.monthsCovered.toFixed(1)
            : "∞"}{" "}
          חודשים מכוסים
        </span>
      </div>

      <p className="text-[10px] text-muted-foreground/80">
        מבוסס על ממוצע הוצאה חודשית של 3 חודשים אחרונים. ההמלצה הסטנדרטית
        בעולם הפיננסי היא 3-6 חודשי הוצאה נזילים.
      </p>
    </section>
  );
}
