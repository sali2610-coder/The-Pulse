"use client";

// Time-of-day spending card. Surfaces the most active hour bucket,
// the highest-spend bucket, and the weekday/weekend split. Auto-hides
// until there are at least 10 qualifying entries in the lookback
// window (so a fresh install doesn't see a noisy card).

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Clock4 } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { spendingHours } from "@/lib/spending-hours";
import { SectionHeader } from "@/components/ui/section-header";
import { EASE_OUT_EXPO } from "@/lib/motion-tokens";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const BUCKET_LABEL: Record<string, string> = {
  morning: "בוקר",
  afternoon: "צהריים",
  evening: "ערב",
  night: "לילה",
};

export function SpendingHoursCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);

  const report = useMemo(() => {
    if (!hydrated) return null;
    return spendingHours({ entries });
  }, [hydrated, entries]);

  if (!hydrated || !report) return null;
  if (!report.hasEnoughData) return null;

  const max = Math.max(...report.buckets.map((b) => b.amount), 1);

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <SectionHeader
        icon={<Clock4 />}
        title="שעות פעילות"
        trailing={
          <span className="text-[10px] text-muted-foreground/70">
            90 ימים אחרונים
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        {report.mostActiveBucket ? (
          <Stat
            label="הכי פעיל"
            value={BUCKET_LABEL[report.mostActiveBucket]}
          />
        ) : null}
        {report.highestSpendBucket ? (
          <Stat
            label="הוצאה גבוהה"
            value={BUCKET_LABEL[report.highestSpendBucket]}
          />
        ) : null}
      </div>

      <ul className="flex flex-col gap-1">
        {report.buckets.map((b, idx) => {
          const pct = max > 0 ? (b.amount / max) * 100 : 0;
          return (
            <li
              key={b.bucket}
              className="flex items-center gap-2 text-[11px] text-muted-foreground"
            >
              <span className="w-20 shrink-0">{b.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{
                    delay: idx * 0.06,
                    duration: 0.6,
                    ease: EASE_OUT_EXPO,
                  }}
                  className="h-full rounded-full"
                  style={{
                    background:
                      "linear-gradient(90deg, var(--neon), color-mix(in oklch, var(--neon) 35%, transparent))",
                  }}
                />
              </div>
              <span
                data-mono="true"
                dir="ltr"
                className="w-20 shrink-0 text-end text-foreground"
              >
                {ILS.format(b.amount)}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/8 bg-black/25 p-2.5 text-[10.5px]">
        <Split
          label="ימי חול"
          share={report.split.weekday.share}
          amount={report.split.weekday.amount}
        />
        <Split
          label="סוף שבוע"
          share={report.split.weekend.share}
          amount={report.split.weekend.amount}
        />
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl border border-white/8 bg-black/25 p-2.5">
      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span className="text-[13px] font-medium text-foreground">{value}</span>
    </div>
  );
}

function Split({
  label,
  share,
  amount,
}: {
  label: string;
  share: number;
  amount: number;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span
        data-mono="true"
        dir="ltr"
        className="text-[12px] text-foreground"
      >
        {ILS.format(amount)} · {Math.round(share * 100)}%
      </span>
    </div>
  );
}
