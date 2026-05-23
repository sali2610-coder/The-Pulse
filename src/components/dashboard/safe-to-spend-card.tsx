"use client";

// Phase 207 — Safe-to-Spend card. The new primary KPI.
//
// "How much can I safely spend until next salary?"
// Reads from the pure safeToSpendUntilNextSalary() compute so the
// number can be reproduced anywhere. Auto-hides without bank anchors
// so a fresh install isn't shown a misleading 0.

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Banknote,
  CalendarClock,
  CreditCard,
  Flame,
  Receipt,
  Sparkles,
  Wallet,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import {
  safeToSpendUntilNextSalary,
  type SafeToSpendVibe,
} from "@/lib/safe-to-spend";
import { SectionHeader } from "@/components/ui/section-header";
import {
  InsightChip,
  type InsightSeverity,
} from "@/components/ui/insight-chip";
import { CardEmpty } from "@/components/ui/card-empty";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { listReveal, SPRING_SOFT } from "@/lib/motion-tokens";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

function signed(n: number): string {
  if (n === 0) return ILS.format(0);
  const s = n > 0 ? "+" : "−";
  return `${s}${ILS.format(Math.abs(n))}`;
}

const VIBE_TONE: Record<SafeToSpendVibe, string> = {
  calm: "#34D399",
  tight: "#D4AF37",
  danger: "#F87171",
};

const VIBE_LABEL: Record<SafeToSpendVibe, string> = {
  calm: "מצב רגוע",
  tight: "מרווח קצר",
  danger: "סיכון חריגה",
};

const VIBE_SEV: Record<SafeToSpendVibe, InsightSeverity> = {
  calm: "info",
  tight: "watch",
  danger: "warn",
};

const NEXT_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "long",
});

export function SafeToSpendCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);

  const report = useMemo(() => {
    if (!hydrated) return null;
    return safeToSpendUntilNextSalary({
      accounts,
      loans,
      incomes,
      entries,
      rules,
      statuses,
    });
  }, [hydrated, accounts, loans, incomes, entries, rules, statuses]);

  if (!hydrated || !report) return null;

  const hasAnchors = accounts.some(
    (a) => a.active && a.kind === "bank" && typeof a.anchorBalance === "number",
  );

  if (!hasAnchors) {
    return (
      <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
        <SectionHeader icon={<Wallet />} title="כסף בטוח לבזבוז" />
        <CardEmpty
          icon={<Banknote className="size-4" />}
          title="חסרה יתרת בנק כעוגן"
          reason="בלי יתרה נוכחית, החישוב לא יודע מאיפה הוא יוצא."
          unlockHint="הגדרות → חשבונות → הוסף חשבון בנק עם יתרה נוכחית."
        />
      </section>
    );
  }

  const tone = VIBE_TONE[report.vibe];
  const sev = VIBE_SEV[report.vibe];
  const label = VIBE_LABEL[report.vibe];
  const nextLabel = report.nextSalaryAtISO
    ? NEXT_FMT.format(new Date(report.nextSalaryAtISO))
    : "סוף החודש הבא";

  const rows: Array<{
    icon: React.ReactNode;
    label: string;
    value: number;
    tone: "pos" | "neg";
  }> = [
    {
      icon: <Banknote className="size-3" />,
      label: "יתרה נוכחית",
      value: report.currentBalance,
      tone: report.currentBalance < 0 ? "neg" : "pos",
    },
    {
      icon: <Wallet className="size-3" />,
      label: "הכנסות עד למשכורת הבאה",
      value: report.expectedSalaryInflow,
      tone: "pos",
    },
    {
      icon: <CreditCard className="size-3" />,
      label: "חיובי כרטיס שעוד יזכו",
      value: -report.expectedCardSettlements,
      tone: "neg",
    },
    {
      icon: <CalendarClock className="size-3" />,
      label: "הלוואות בחלון",
      value: -report.expectedLoanDebits,
      tone: "neg",
    },
    {
      icon: <Receipt className="size-3" />,
      label: "התחייבויות קבועות בחלון",
      value: -report.expectedRecurringDebits,
      tone: "neg",
    },
    {
      icon: <Flame className="size-3" />,
      label: `כרית קצב יומי (${Math.round(report.dailyBurnAverage)} ש"ח/יום)`,
      value: -report.dailyBurnCushion,
      tone: "neg",
    },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_SOFT}
      className="glass-card flex flex-col gap-3 rounded-3xl p-4"
    >
      <SectionHeader
        icon={<Wallet />}
        title="כסף בטוח לבזבוז"
        trailing={
          <InsightChip
            severity={sev}
            icon={<Sparkles className="size-2.5" />}
            label={label}
          />
        }
      />

      <div className="flex items-baseline justify-between gap-3">
        <span
          data-mono="true"
          dir="ltr"
          className="text-[34px] font-light leading-none"
          style={{ color: tone }}
        >
          <AnimatedCounter value={report.safeToSpend} format={(v) => signed(v)} />
        </span>
        <span className="text-[10.5px] text-muted-foreground/85">
          עד {nextLabel}
          <br />
          <span dir="ltr">{report.daysUntilNextSalary} ימים מהיום</span>
        </span>
      </div>

      <ul className="flex flex-col gap-0.5 border-t border-white/8 pt-2">
        {rows.map((r, idx) => (
          <motion.li
            key={r.label}
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            transition={listReveal(idx)}
            className="flex items-center justify-between gap-2 py-0.5"
          >
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="text-[color:var(--neon)]/80">{r.icon}</span>
              {r.label}
            </span>
            <span
              data-mono="true"
              dir="ltr"
              className="text-[12.5px]"
              style={{ color: r.tone === "neg" ? "#F87171" : "#34D399" }}
            >
              {signed(r.value)}
            </span>
          </motion.li>
        ))}
      </ul>

      <p className="text-[10px] text-muted-foreground/80">
        חיובי כרטיס מחויבים על פי יום החיוב של הכרטיס, לא יום הרכישה.
        תשלום בכרטיס לא יוצא מהבנק עד שמגיע יום הסליקה.
      </p>
    </motion.section>
  );
}
