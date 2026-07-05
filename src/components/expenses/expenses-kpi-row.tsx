"use client";

// Expenses · KPI chip row.
//
// Six compact tone-tinted mini cards computed from existing store
// selectors. Zero engine change; every count is derived at render
// time from data the tab already renders.
//
//   1. תשלומים פתוחים   — active installment plans (installments > 1
//                          and future slices still landing)
//   2. חיובים קבועים על הכרטיס — RecurringRule with paymentSource="card"
//   3. Wallet             — entries with source="wallet"
//   4. יבוא / SMS         — entries with source ∈ {sms, auto}
//   5. ממתינים לאישור    — entries where needsConfirmation && !confirmedAt
//   6. תיעוד ידני         — entries with source="manual"

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  ClipboardCheck,
  CreditCard,
  ImportIcon,
  Layers,
  Smartphone,
  Sparkles,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import type { ExpenseEntry } from "@/types/finance";

type ChipTone = "gold" | "cyan" | "purple" | "safe" | "watch" | "danger";
type Chip = {
  key: string;
  label: string;
  count: number;
  hint: string;
  tone: ChipTone;
  icon: React.ReactNode;
};

function isFutureInstallmentEntry(e: ExpenseEntry, now: Date): boolean {
  if (!e.installments || e.installments <= 1) return false;
  const start = new Date(e.chargeDate);
  if (Number.isNaN(start.getTime())) return false;
  const monthsElapsed =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth());
  return monthsElapsed < e.installments;
}

export function ExpensesKpiRow() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);

  const chips = useMemo<Chip[]>(() => {
    if (!hydrated) return [];
    const now = new Date();
    const openInstallments = entries.filter((e) =>
      isFutureInstallmentEntry(e, now),
    ).length;
    const cardRules = rules.filter(
      (r) => r.active && r.paymentSource === "card",
    ).length;
    const walletCount = entries.filter((e) => e.source === "wallet").length;
    const importCount = entries.filter(
      (e) => e.source === "sms" || e.source === "auto",
    ).length;
    const pendingCount = entries.filter(
      (e) => e.needsConfirmation && !e.confirmedAt,
    ).length;
    const manualCount = entries.filter(
      (e) => e.source === "manual" || e.source === undefined,
    ).length;
    return [
      {
        key: "open-installments",
        label: "תשלומים פתוחים",
        count: openInstallments,
        hint: "פרוסים לחודשים",
        tone: "purple",
        icon: <Layers className="size-3.5" />,
      },
      {
        key: "card-rules",
        label: "חיובים על הכרטיס",
        count: cardRules,
        hint: "מנויים והוראות קבע",
        tone: "cyan",
        icon: <CreditCard className="size-3.5" />,
      },
      {
        key: "wallet",
        label: "Wallet",
        count: walletCount,
        hint: "חיובים מהארנק",
        tone: "gold",
        icon: <Sparkles className="size-3.5" />,
      },
      {
        key: "import",
        label: "יבוא / SMS",
        count: importCount,
        hint: "מתקבלים אוטומטית",
        tone: "safe",
        icon: <ImportIcon className="size-3.5" />,
      },
      {
        key: "pending",
        label: "ממתינים לאישור",
        count: pendingCount,
        hint: "צריכים אישור",
        tone: pendingCount > 0 ? "watch" : "safe",
        icon: <ClipboardCheck className="size-3.5" />,
      },
      {
        key: "manual",
        label: "תיעוד ידני",
        count: manualCount,
        hint: "נכתבו ידנית",
        tone: "gold",
        icon: <Smartphone className="size-3.5" />,
      },
    ];
  }, [hydrated, entries, rules]);

  if (!hydrated) return null;

  return (
    <div className="ex-kpi-grid" dir="rtl" aria-label="מדדים מהירים">
      {chips.map((c, i) => (
        <motion.div
          key={c.key}
          className="ex-kpi"
          data-tone={c.tone}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: Math.min(i * 0.03, 0.18),
            duration: 0.32,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <span aria-hidden className="ex-kpi-icon">
            {c.icon}
          </span>
          <div className="ex-kpi-text">
            <span className="ex-kpi-label">{c.label}</span>
            <span className="ex-kpi-hint">{c.hint}</span>
          </div>
          <span className="ex-kpi-count" data-mono="true" dir="ltr">
            {c.count}
          </span>
        </motion.div>
      ))}
    </div>
  );
}
