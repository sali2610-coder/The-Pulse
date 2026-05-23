"use client";

// Income forecast card — expected income this month + next, plus
// a confidence chip. Auto-hides when neither month has any expected
// income (no scheduled income, no irregular history).

import { useMemo } from "react";
import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { incomeForecast } from "@/lib/income-forecast";
import { currentMonthKey } from "@/lib/dates";
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

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "ביטחון גבוה",
  medium: "ביטחון בינוני",
  low: "ביטחון נמוך",
};

const CONFIDENCE_SEVERITY: Record<string, InsightSeverity> = {
  high: "info",
  medium: "watch",
  low: "warn",
};

const MONTH_FMT = new Intl.DateTimeFormat("he-IL", {
  month: "long",
});

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return MONTH_FMT.format(new Date(y, (m ?? 1) - 1, 1));
}

export function IncomeForecastCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);

  const report = useMemo(() => {
    if (!hydrated) return null;
    return incomeForecast({
      incomes,
      entries,
      monthKey: currentMonthKey(),
    });
  }, [hydrated, incomes, entries]);

  if (!hydrated || !report) return null;
  if (report.expectedTotal === 0 && report.nextMonth.expectedTotal === 0) {
    return null;
  }

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <SectionHeader
        icon={<TrendingUp />}
        title="תחזית הכנסה"
        trailing={
          <InsightChip
            severity={CONFIDENCE_SEVERITY[report.confidence]}
            label={CONFIDENCE_LABEL[report.confidence]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-2">
        <Stat
          index={0}
          title={`החודש (${monthLabel(report.monthKey)})`}
          total={report.expectedTotal}
          scheduled={report.scheduledMonthly}
          irregular={report.irregularMonthly}
        />
        <Stat
          index={1}
          title={`הבא (${monthLabel(report.nextMonth.monthKey)})`}
          total={report.nextMonth.expectedTotal}
          scheduled={report.nextMonth.scheduledMonthly}
          irregular={report.nextMonth.irregularMonthly}
        />
      </div>

      <p className="text-[10.5px] text-muted-foreground/85">
        {explanation(report)}
      </p>
    </section>
  );
}

function Stat({
  index,
  title,
  total,
  scheduled,
  irregular,
}: {
  index: number;
  title: string;
  total: number;
  scheduled: number;
  irregular: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={listReveal(index)}
      className="flex flex-col gap-1 rounded-2xl border border-white/8 bg-black/25 p-3"
    >
      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </span>
      <span
        data-mono="true"
        dir="ltr"
        className="text-[16px] font-medium text-foreground"
      >
        {ILS.format(total)}
      </span>
      <span className="text-[10px] text-muted-foreground/80">
        קבוע {ILS.format(scheduled)} · משתנה {ILS.format(irregular)}
      </span>
    </motion.div>
  );
}

function explanation(report: ReturnType<typeof incomeForecast>): string {
  if (report.scheduledMonthly === 0 && report.irregularMonthly === 0) {
    return "לא הוגדרו הכנסות. הוסף הכנסה קבועה ב\"הגדרות\" כדי לקבל תחזית.";
  }
  if (report.scheduledMonthly > 0 && report.irregularMonthly === 0) {
    return "התחזית מבוססת על ההכנסות הקבועות בלבד.";
  }
  if (report.scheduledMonthly === 0 && report.irregularMonthly > 0) {
    return `התחזית מבוססת רק על ממוצע זיכויים מ-${report.lookbackMonths} החודשים האחרונים — שקול להגדיר הכנסה קבועה.`;
  }
  return `שילוב של הכנסות קבועות + ממוצע זיכויים מ-${report.lookbackMonths} החודשים האחרונים.`;
}
