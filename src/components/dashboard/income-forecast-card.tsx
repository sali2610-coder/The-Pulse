"use client";

// Income forecast card — expected income this month + next, plus
// a confidence chip. Auto-hides when neither month has any expected
// income (no scheduled income, no irregular history).

import { useMemo } from "react";
import { TrendingUp } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { incomeForecast } from "@/lib/income-forecast";
import { currentMonthKey } from "@/lib/dates";

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

const CONFIDENCE_TONE: Record<string, string> = {
  high: "#34D399",
  medium: "#D4AF37",
  low: "#A1A1AA",
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

  const tone = CONFIDENCE_TONE[report.confidence];

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <header className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <TrendingUp className="size-3 text-[color:var(--neon)]" />
          תחזית הכנסה
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-[0.18em]"
          style={{ background: `${tone}22`, color: tone }}
          dir="ltr"
        >
          {CONFIDENCE_LABEL[report.confidence]}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <Stat
          title={`החודש (${monthLabel(report.monthKey)})`}
          total={report.expectedTotal}
          scheduled={report.scheduledMonthly}
          irregular={report.irregularMonthly}
        />
        <Stat
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
  title,
  total,
  scheduled,
  irregular,
}: {
  title: string;
  total: number;
  scheduled: number;
  irregular: number;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-white/8 bg-black/25 p-3">
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
    </div>
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
