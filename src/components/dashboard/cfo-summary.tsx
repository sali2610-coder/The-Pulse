"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  ArrowDownToLine,
  Banknote,
  CreditCard,
  Layers,
  Receipt,
  Wallet,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { forecastEndOfMonth } from "@/lib/forecast";

const formatILSSign = (value: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
    signDisplay: "always",
  }).format(value);

const formatILS = (value: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value);

export function CfoSummary() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);

  const eom = useMemo(() => {
    if (!hydrated) return null;
    return forecastEndOfMonth({
      accounts,
      loans,
      incomes,
      entries,
      rules,
      statuses,
      monthKey: currentMonthKey(),
    });
  }, [hydrated, accounts, loans, incomes, entries, rules, statuses]);

  const hasAnchors = accounts.some(
    (a) => a.kind === "bank" && a.active && a.anchorBalance !== undefined,
  );

  if (!hydrated) return null;

  if (!hasAnchors) {
    return (
      <section className="rounded-3xl border border-dashed border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent p-5 backdrop-blur-md">
        <div className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
          CFO Brain
        </div>
        <div className="mt-2 text-sm text-foreground">
          הוסף לפחות חשבון בנק אחד עם anchor כדי לקבל תחזית סוף חודש מלאה.
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          הגדרות → חשבונות → חשבון בנק → קבע יתרה נוכחית.
        </div>
      </section>
    );
  }

  if (!eom) return null;

  const isRed = eom.forecast < 0;
  const accent = isRed ? "#F87171" : "#34D399";

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-5 backdrop-blur-2xl"
      style={{
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 30px 60px -40px ${accent}55`,
      }}
    >
      <header className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
            <span
              className="inline-block size-1.5 rounded-full"
              style={{ background: accent, boxShadow: `0 0 8px ${accent}` }}
            />
            CFO Brain · End of month
          </div>
          <motion.div
            key={Math.round(eom.forecast)}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            data-mono="true"
            className="mt-2 text-3xl font-light tracking-tight"
            style={{ direction: "ltr", color: accent }}
          >
            {formatILSSign(eom.forecast)}
          </motion.div>
          <div className="text-xs text-muted-foreground">
            {isRed ? "סיום חודש בחריגה" : "סיום חודש בעודף"}
          </div>
        </div>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-2.5 text-[11px]">
        <BreakdownRow
          icon={<Wallet className="size-3.5" />}
          label="Anchors"
          value={formatILSSign(eom.totalAnchors)}
          tone={eom.totalAnchors >= 0 ? "positive" : "negative"}
        />
        <BreakdownRow
          icon={<ArrowDownToLine className="size-3.5" />}
          label="הכנסות צפויות"
          value={formatILSSign(eom.expectedIncome)}
          tone="positive"
        />
        <BreakdownRow
          icon={<Receipt className="size-3.5" />}
          label="הוצאות קבועות"
          value={`−${formatILS(eom.pendingFixed)}`}
          tone="negative"
        />
        <BreakdownRow
          icon={<Banknote className="size-3.5" />}
          label="הלוואות"
          value={`−${formatILS(eom.pendingLoans)}`}
          tone="negative"
        />
        <BreakdownRow
          icon={<CreditCard className="size-3.5" />}
          label="כרטיסים עתידי"
          value={`−${formatILS(eom.futureCardSlices)}`}
          tone="negative"
        />
        <BreakdownRow
          icon={<Layers className="size-3.5" />}
          label="חשבונות פעילים"
          value={`${accounts.filter((a) => a.active).length}`}
          tone="neutral"
        />
      </div>
    </motion.section>
  );
}

function BreakdownRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral";
}) {
  const color =
    tone === "positive"
      ? "#34D399"
      : tone === "negative"
        ? "#F87171"
        : "#A8A8A8";
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/30 px-3 py-2">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span
        data-mono="true"
        style={{ direction: "ltr", color }}
        className="font-medium"
      >
        {value}
      </span>
    </div>
  );
}
