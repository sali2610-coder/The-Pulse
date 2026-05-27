"use client";

// Phase 239+240 — "איך חישבנו?" transparency panel.
//
// Renders the same math as HeroFutureBalanceCard, but breaks the
// signed deltas into the five categories called out in the brief.
// Collapsed by default — power-user verification surface, not the
// primary read. When the engine deliberately skipped pending
// entries (bankPending / needsConfirmation without confirmedAt) we
// surface a transparent warning so the user knows why a charge
// they expect isn't in the figure.

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Banknote,
  ChevronDown,
  CreditCard,
  HandCoins,
  Landmark,
  Wallet,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import {
  buildFutureBalanceBreakdown,
  type FutureBalanceBreakdown,
} from "@/lib/future-balance-explain";
import { tap } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

export function FutureBalanceExplain({ offset }: { offset: number }) {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);

  const [open, setOpen] = useState(false);

  const data = useMemo<FutureBalanceBreakdown | null>(() => {
    if (!hydrated) return null;
    return buildFutureBalanceBreakdown({
      accounts,
      loans,
      incomes,
      rules,
      statuses,
      entries,
      offset,
      windowDays: 60,
    });
  }, [hydrated, accounts, loans, incomes, rules, statuses, entries, offset]);

  if (!data) return null;
  const hasAnchors = accounts.some(
    (a) => a.active && a.kind === "bank" && typeof a.anchorBalance === "number",
  );
  if (!hasAnchors) return null;

  function toggle() {
    setOpen((v) => !v);
    tap();
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-white/8 bg-black/25">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start transition-colors hover:bg-white/3"
      >
        <span className="text-section text-foreground">איך חישבנו?</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-muted-foreground"
        >
          <ChevronDown className="size-5" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-white/8"
          >
            <div className="flex flex-col gap-2 p-4">
              <p className="text-caption text-muted-foreground">
                התחזית לתאריך{" "}
                <span dir="rtl">
                  {DAY_FMT.format(new Date(data.whenISO))}
                </span>{" "}
                מורכבת מהפעולות הבאות:
              </p>

              <Row
                icon={<Banknote className="size-4" />}
                tone="info"
                label="יתרת בנק נוכחית"
                value={data.startingBalance}
                sign="="
              />
              <Row
                icon={<Wallet className="size-4" />}
                tone="ok"
                label="הכנסות צפויות"
                value={data.income}
                sign="+"
              />
              <Row
                icon={<CreditCard className="size-4" />}
                tone="danger"
                label="חיובי כרטיסי אשראי"
                value={data.cardSettlements}
                sign="−"
              />
              <Row
                icon={<Landmark className="size-4" />}
                tone="danger"
                label="חיובי בנק קבועים"
                value={data.bankFixed}
                sign="−"
              />
              <Row
                icon={<HandCoins className="size-4" />}
                tone="danger"
                label="הלוואות"
                value={data.loans}
                sign="−"
              />

              <div className="mt-2 flex items-baseline justify-between gap-2 rounded-xl border border-white/12 bg-black/40 px-3 py-2.5">
                <span className="text-section text-foreground">צפי סופי</span>
                <span
                  data-mono="true"
                  dir="ltr"
                  className="text-section"
                  style={{
                    color:
                      data.projectedBalance < 0
                        ? "#F87171"
                        : data.projectedBalance < 500
                          ? "#F59E0B"
                          : "#34D399",
                  }}
                >
                  {data.projectedBalance < 0 ? "−" : ""}
                  {ILS.format(Math.abs(Math.round(data.projectedBalance)))}
                </span>
              </div>

              {data.excludedPendingCount > 0 ? (
                <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-caption font-medium text-amber-400">
                      {data.excludedPendingCount} חיובים תלויים ועומדים לא
                      נספרו (
                      <span dir="ltr">
                        {ILS.format(Math.round(data.excludedPendingTotal))}
                      </span>
                      )
                    </span>
                    <span className="text-caption text-muted-foreground">
                      חיובי SMS שעדיין &quot;תלוי ועומד&quot; או הוצאות
                      Wallet שעוד לא אישרת — Pulse מחכה לאישור לפני
                      שמוסיף אותם לתחזית.
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function Row({
  icon,
  tone,
  label,
  value,
  sign,
}: {
  icon: React.ReactNode;
  tone: "ok" | "danger" | "info";
  label: string;
  value: number;
  sign: "+" | "−" | "=";
}) {
  const color =
    tone === "danger" ? "#F87171" : tone === "ok" ? "#34D399" : "#60A5FA";
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span
          className="flex size-7 items-center justify-center rounded-lg"
          style={{ background: `${color}22`, color }}
        >
          {icon}
        </span>
        <span className="text-body text-foreground">{label}</span>
      </div>
      <span
        data-mono="true"
        dir="ltr"
        className="text-body"
        style={{ color: sign === "−" ? "#F87171" : tone === "ok" ? "#34D399" : undefined }}
      >
        {sign === "=" ? "" : sign}
        {ILS.format(Math.round(value))}
      </span>
    </div>
  );
}
