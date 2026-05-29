"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownToLine,
  Banknote,
  ChevronDown,
  CreditCard,
  Layers,
  Receipt,
  Wallet,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey, monthKeyOf } from "@/lib/dates";
import { buildFinancialSnapshot } from "@/lib/financial-snapshot";
import { ruleSchedule, loanSchedule } from "@/lib/installment-schedule";
import { sliceForMonth } from "@/lib/projections";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { tap as hapticTap } from "@/lib/haptics";

// Manual sign-prepending instead of `signDisplay: "always"` — the latter
// throws RangeError on iOS Safari < 15.4 when Intl.NumberFormat is
// constructed at module load, taking the whole card with it.
const _ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const formatILS = (value: number) => _ils.format(value);
const formatILSSign = (value: number) => {
  if (value === 0) return _ils.format(0);
  const sign = value > 0 ? "+" : "−";
  return `${sign}${_ils.format(Math.abs(value))}`;
};

type Section = "balance" | "income" | "fixed" | "loans" | "installments" | "future";

export function CfoSummary() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);
  const [openSection, setOpenSection] = useState<Section | null>(null);

  // Read from the single financial snapshot so every card on the dashboard
  // agrees on the same numbers. Previously CFO ran its own
  // forecastEndOfMonth which produced subtly different totals.
  const snap = useMemo(() => {
    if (!hydrated) return null;
    return buildFinancialSnapshot({
      accounts,
      loans,
      incomes,
      entries,
      rules,
      statuses,
      monthlyBudget,
      monthKey: currentMonthKey(),
    });
  }, [
    hydrated,
    accounts,
    loans,
    incomes,
    entries,
    rules,
    statuses,
    monthlyBudget,
  ]);

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

  if (!snap) return null;

  // Phase 279 — derive the contributing line items so each
  // BreakdownRow can expand inline to show "what's actually in this
  // number". Same engine inputs, same filters as buildFinancialSnapshot.
  const monthKey = currentMonthKey();
  const now = new Date();
  const isCurrentMonth = monthKeyOf(now) === monthKey;
  const today = now.getDate();

  const balanceItems = accounts
    .filter(
      (a) => a.active && a.kind === "bank" && a.anchorBalance !== undefined,
    )
    .map((a) => ({
      id: a.id,
      label: a.label || "חשבון",
      value: a.anchorBalance ?? 0,
    }));

  const incomeItems = incomes
    .filter((i) => i.active && (!isCurrentMonth || i.dayOfMonth >= today))
    .map((i) => ({
      id: i.id,
      label: i.label || "הכנסה",
      value: i.amount,
    }));

  const paidThisMonth = new Set(
    statuses
      .filter((s) => s.monthKey === monthKey && s.status === "paid")
      .map((s) => s.ruleId),
  );
  const fixedItems: { id: string; label: string; value: number }[] = [];
  const installmentRuleItems: { id: string; label: string; value: number }[] = [];
  for (const r of rules) {
    if (!r.active) continue;
    if (paidThisMonth.has(r.id)) continue;
    if (!ruleSchedule(r, monthKey).active) continue;
    if (isCurrentMonth && r.dayOfMonth < today) continue;
    if (r.installmentTotal) {
      installmentRuleItems.push({
        id: r.id,
        label: r.label,
        value: r.estimatedAmount,
      });
    } else {
      fixedItems.push({
        id: r.id,
        label: r.label,
        value: r.estimatedAmount,
      });
    }
  }

  const loanItems = loans
    .filter(
      (l) =>
        loanSchedule(l, monthKey).active &&
        !(isCurrentMonth && l.dayOfMonth < today),
    )
    .map((l) => ({
      id: l.id,
      label: l.label,
      value: l.monthlyInstallment,
    }));

  const futureSliceItems: { id: string; label: string; value: number }[] = [];
  for (const e of entries) {
    if (e.needsConfirmation || e.bankPending || e.isRefund) continue;
    if (e.excludeFromBudget) continue;
    if (e.currency && e.currency !== "ILS") continue;
    const slice = sliceForMonth(e, monthKey);
    if (!slice) continue;
    if (slice.chargeDate.getTime() <= now.getTime()) continue;
    futureSliceItems.push({
      id: e.id,
      label: e.merchant || e.note || "חיוב",
      value: slice.amount,
    });
  }

  const sectionItems: Record<Section, { id: string; label: string; value: number }[]> = {
    balance: balanceItems,
    income: incomeItems,
    fixed: fixedItems,
    loans: loanItems,
    installments: installmentRuleItems,
    future: futureSliceItems,
  };

  // Project the same line the rest of the dashboard uses — net cash on
  // the 1st of next month BEFORE applying the discretionary spending
  // budget. CFO has always been "where is my money if I behave?" — the
  // dedicated CashflowSummaryCard above already applies the budget.
  const forecast = snap.projectedBalanceWithoutDiscretionary;
  const isRed = forecast < 0;
  const accent = isRed ? "#F87171" : "#34D399";

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-5 backdrop-blur-md"
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
          <div
            data-mono="true"
            className="mt-2 text-3xl font-light tracking-tight"
            style={{ direction: "ltr", color: accent }}
          >
            <AnimatedCounter value={forecast} format={formatILSSign} />
          </div>
          <div className="text-xs text-muted-foreground">
            {isRed ? "סיום חודש בחריגה" : "סיום חודש בעודף"}
          </div>
        </div>
      </header>

      {/* Phase 284 — permanent formula recap. Spells out the exact
         arithmetic the headline number comes from so the user reads
         "why" alongside "what". Items list below each carries the
         full source breakdown (Phase 279). */}
      <div
        className="mt-4 flex flex-col gap-1 rounded-2xl border border-white/8 bg-black/30 p-3 text-[11px]"
        dir="ltr"
      >
        <FormulaLine
          label="יתרה נוכחית"
          value={snap.currentBalance}
          sign="="
        />
        <FormulaLine
          label="הכנסות צפויות"
          value={snap.expectedIncomeUntilNextMonth}
          sign="+"
        />
        <FormulaLine
          label="הוצאות קבועות"
          value={snap.fixedExpensesUntilNextMonth}
          sign="−"
        />
        <FormulaLine
          label="הלוואות"
          value={snap.activeLoansPaymentsUntilNextMonth}
          sign="−"
        />
        <FormulaLine
          label="תשלומים"
          value={snap.installmentPaymentsUntilNextMonth}
          sign="−"
        />
        <FormulaLine
          label="חיובי כרטיס עתידיים"
          value={snap.recurringCommitmentsUntilNextMonth}
          sign="−"
        />
        <div className="mt-1 h-px bg-white/10" />
        <FormulaLine
          label={isRed ? "צפי לגירעון" : "צפי לסיום החודש"}
          value={forecast}
          sign="="
          tone={isRed ? "danger" : "ok"}
          strong
        />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2.5 text-[11px]">
        <BreakdownRow
          icon={<Wallet className="size-3.5" />}
          label="יתרה נוכחית"
          value={formatILSSign(snap.currentBalance)}
          tone={snap.currentBalance >= 0 ? "positive" : "negative"}
          items={sectionItems.balance}
          section="balance"
          openSection={openSection}
          setOpenSection={setOpenSection}
        />
        <BreakdownRow
          icon={<ArrowDownToLine className="size-3.5" />}
          label="הכנסות צפויות"
          value={formatILSSign(snap.expectedIncomeUntilNextMonth)}
          tone="positive"
          items={sectionItems.income}
          section="income"
          openSection={openSection}
          setOpenSection={setOpenSection}
        />
        <BreakdownRow
          icon={<Receipt className="size-3.5" />}
          label="הוצאות קבועות"
          value={`−${formatILS(snap.fixedExpensesUntilNextMonth)}`}
          tone="negative"
          items={sectionItems.fixed}
          section="fixed"
          openSection={openSection}
          setOpenSection={setOpenSection}
        />
        <BreakdownRow
          icon={<Banknote className="size-3.5" />}
          label="הלוואות"
          value={`−${formatILS(snap.activeLoansPaymentsUntilNextMonth)}`}
          tone="negative"
          items={sectionItems.loans}
          section="loans"
          openSection={openSection}
          setOpenSection={setOpenSection}
        />
        <BreakdownRow
          icon={<CreditCard className="size-3.5" />}
          label="תשלומים"
          value={`−${formatILS(snap.installmentPaymentsUntilNextMonth)}`}
          tone="negative"
          items={sectionItems.installments}
          section="installments"
          openSection={openSection}
          setOpenSection={setOpenSection}
        />
        <BreakdownRow
          icon={<Layers className="size-3.5" />}
          label="חיובי כרטיס עתידיים"
          value={`−${formatILS(snap.recurringCommitmentsUntilNextMonth)}`}
          tone="negative"
          items={sectionItems.future}
          section="future"
          openSection={openSection}
          setOpenSection={setOpenSection}
        />
      </div>

      <AnimatePresence initial={false}>
        {openSection ? (
          <motion.div
            key={`expand-${openSection}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <SectionDetail
              items={sectionItems[openSection]}
              tone={openSection === "balance" || openSection === "income" ? "positive" : "negative"}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.section>
  );
}

function FormulaLine({
  label,
  value,
  sign,
  tone,
  strong,
}: {
  label: string;
  value: number;
  sign: "+" | "−" | "=";
  tone?: "ok" | "danger";
  strong?: boolean;
}) {
  const color =
    tone === "danger"
      ? "#F87171"
      : tone === "ok"
        ? "#34D399"
        : sign === "−"
          ? "#FCA5A5"
          : sign === "+"
            ? "#86EFAC"
            : "#E5E7EB";
  const display =
    sign === "="
      ? formatILSSign(value)
      : `${sign}${formatILS(Math.abs(value))}`;
  return (
    <div className="flex items-center justify-between gap-3">
      <span
        className={`text-muted-foreground ${strong ? "text-foreground" : ""}`}
        dir="rtl"
      >
        {label}
      </span>
      <span
        data-mono="true"
        className={strong ? "text-[13px] font-semibold" : "font-medium"}
        style={{ color }}
      >
        {display}
      </span>
    </div>
  );
}

function SectionDetail({
  items,
  tone,
}: {
  items: { id: string; label: string; value: number }[];
  tone: "positive" | "negative";
}) {
  const color = tone === "positive" ? "#34D399" : "#F87171";
  if (items.length === 0) {
    return (
      <p className="mt-3 rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-[11px] text-muted-foreground">
        אין פריטים שתורמים לסכום הזה כרגע.
      </p>
    );
  }
  return (
    <ul className="mt-3 flex flex-col gap-1 rounded-xl border border-white/8 bg-black/25 p-2">
      {items.map((it) => (
        <li
          key={it.id}
          className="flex items-baseline justify-between gap-2 px-2 py-1"
        >
          <span className="truncate text-[11px] text-foreground">{it.label}</span>
          <span
            data-mono="true"
            dir="ltr"
            className="text-[11px] font-medium"
            style={{ color }}
          >
            {tone === "negative" ? "−" : ""}
            {_ils.format(Math.round(Math.abs(it.value)))}
          </span>
        </li>
      ))}
    </ul>
  );
}

function BreakdownRow({
  icon,
  label,
  value,
  tone,
  items,
  section,
  openSection,
  setOpenSection,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral";
  items: { id: string; label: string; value: number }[];
  section: Section;
  openSection: Section | null;
  setOpenSection: (s: Section | null) => void;
}) {
  const color =
    tone === "positive"
      ? "#34D399"
      : tone === "negative"
        ? "#F87171"
        : "#A8A8A8";
  const isOpen = openSection === section;
  return (
    <button
      type="button"
      onClick={() => {
        hapticTap();
        setOpenSection(isOpen ? null : section);
      }}
      aria-expanded={isOpen}
      aria-controls={`cfo-detail-${section}`}
      className={`flex items-center justify-between rounded-xl border px-3 py-2 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60 ${
        isOpen
          ? "border-white/16 bg-black/40"
          : "border-white/5 bg-black/30 hover:border-white/12"
      }`}
    >
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
        <span className="text-[10px] text-muted-foreground/60">
          · {items.length}
        </span>
      </span>
      <span className="flex items-center gap-1.5">
        <span
          data-mono="true"
          style={{ direction: "ltr", color }}
          className="font-medium"
        >
          {value}
        </span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.18 }}
          className="text-muted-foreground/70"
          aria-hidden
        >
          <ChevronDown className="size-3" />
        </motion.span>
      </span>
    </button>
  );
}
