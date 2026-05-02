"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Wallet, TrendingUp } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { projectMonth } from "@/lib/projections";

const formatILS = (value: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value);

type StatProps = {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
  accent: "neon" | "gold";
  delay: number;
};

function Stat({ label, value, hint, icon, accent, delay }: StatProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: "easeOut" }}
      className="relative overflow-hidden rounded-2xl border border-border/60 bg-surface/70 p-5 backdrop-blur-md"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-muted-foreground/80">{icon}</span>
      </div>
      <motion.div
        key={value}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        data-mono="true"
        className="mt-3 text-3xl font-medium tracking-tight text-foreground"
        style={{ direction: "ltr", textAlign: "right" }}
      >
        {formatILS(value)}
      </motion.div>
      <div
        className={`mt-1 text-xs ${accent === "gold" ? "text-gold/90" : "text-neon/90"}`}
      >
        {hint}
      </div>
    </motion.div>
  );
}

export function StatsCards() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);

  const { actual, projected, upcoming } = useMemo(() => {
    if (!hydrated) return { actual: 0, projected: 0, upcoming: 0 };
    return projectMonth({
      entries,
      rules,
      statuses,
      monthKey: currentMonthKey(),
    });
  }, [hydrated, entries, rules, statuses]);

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4">
      <Stat
        label="בפועל החודש"
        value={actual}
        hint={
          actual === 0 ? "אין חיובים עדיין" : `מתוך ${entries.length} עסקאות`
        }
        icon={<Wallet className="size-4" />}
        accent="neon"
        delay={0.1}
      />
      <Stat
        label="צפי לסוף חודש"
        value={projected}
        hint={upcoming === 0 ? "ללא חיובים נוספים" : `+${formatILS(upcoming)} צפויים`}
        icon={<TrendingUp className="size-4" />}
        accent="gold"
        delay={0.2}
      />
    </div>
  );
}
