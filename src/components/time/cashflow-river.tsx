"use client";

// Phase 358 / C — CashflowRiver.
//
// Vertical waterfall connecting salary → fixed → loans → cards →
// "you are here." Each node lights sequentially on mount and on
// cursor change (80ms cascade). The path is a single SVG drawn in
// the state tone with a soft glow.
//
// Numbers come from the existing financial-snapshot for the EOM
// view, AND from the curve's per-cursor window inflow/outflow so
// the river updates when the user scrubs.

import { AnimatePresence, motion } from "framer-motion";
import { Briefcase, CreditCard, Landmark, Receipt, Target } from "lucide-react";

import type { TimeFrame } from "./use-time-engine";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

type Node = {
  key: string;
  label: string;
  amount: number;
  /** +1 for inflow, -1 for outflow, 0 for the "you" anchor. */
  sign: 1 | -1 | 0;
  Icon: typeof Briefcase;
};

const BAND_TONE: Record<string, string> = {
  safe: "#D4AF37",
  steady: "#00E5FF",
  watch: "#F5C76A",
  risk: "#FF8A65",
  danger: "#F87171",
};

export function CashflowRiver({ frame }: { frame: TimeFrame }) {
  const snap = frame.snapshotEom;
  const tone = BAND_TONE[frame.health?.band ?? "steady"];

  // Compose nodes. Income vs outflows are pulled from the cursor
  // window first (so the river reacts to scrubbing); the snapshot is
  // the fallback for "what hits between now and EOM."
  const nodes: Node[] = [];
  if (frame.windowInflow > 0 || snap?.expectedIncomeUntilNextMonth) {
    nodes.push({
      key: "income",
      label: "משכורת + הכנסות",
      amount: frame.windowInflow > 0
        ? frame.windowInflow
        : Math.round(snap?.expectedIncomeUntilNextMonth ?? 0),
      sign: 1,
      Icon: Briefcase,
    });
  }
  if (snap && snap.fixedExpensesUntilNextMonth > 0) {
    nodes.push({
      key: "fixed",
      label: "הוצאות קבועות",
      amount: Math.round(snap.fixedExpensesUntilNextMonth),
      sign: -1,
      Icon: Receipt,
    });
  }
  if (snap && snap.activeLoansPaymentsUntilNextMonth > 0) {
    nodes.push({
      key: "loans",
      label: "הלוואות",
      amount: Math.round(snap.activeLoansPaymentsUntilNextMonth),
      sign: -1,
      Icon: Landmark,
    });
  }
  if (snap && snap.recurringCommitmentsUntilNextMonth > 0) {
    nodes.push({
      key: "cards",
      label: "כרטיסי אשראי",
      amount: Math.round(snap.recurringCommitmentsUntilNextMonth),
      sign: -1,
      Icon: CreditCard,
    });
  }
  nodes.push({
    key: "you",
    label: `אתה כאן · +${frame.cursorOffset} ימים`,
    amount: frame.balance,
    sign: 0,
    Icon: Target,
  });

  return (
    <section
      className="relative mx-auto w-full max-w-md px-1"
      aria-label="זרם תזרים מזומנים אל יעד התאריך"
      dir="rtl"
    >
      <ol className="flex flex-col">
        <AnimatePresence initial>
          {nodes.map((n, i) => (
            <motion.li
              key={n.key}
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.32, delay: i * 0.08, ease: "easeOut" }}
              className="relative flex items-center gap-3 py-2.5"
            >
              {/* Vertical thread to next node */}
              {i < nodes.length - 1 ? (
                <span
                  aria-hidden
                  className="absolute top-[42px] right-[19px] block w-px"
                  style={{
                    height: "calc(100% - 16px)",
                    background: `linear-gradient(180deg, ${tone}55, ${tone}11)`,
                  }}
                />
              ) : null}

              {/* Node dot */}
              <span
                aria-hidden
                className="z-10 flex size-10 items-center justify-center rounded-full border"
                style={{
                  background: n.key === "you" ? `${tone}22` : "rgba(255,255,255,0.04)",
                  borderColor: n.key === "you" ? tone : "rgba(255,255,255,0.12)",
                  boxShadow: n.key === "you" ? `0 0 18px ${tone}66` : "none",
                  color: n.sign === 1 ? "#34D399" : n.sign === -1 ? "#F87171" : tone,
                }}
              >
                <n.Icon className="size-4" />
              </span>

              <span className="flex-1 text-[12.5px] text-foreground/85">
                {n.label}
              </span>

              <span
                data-mono="true"
                dir="ltr"
                className="text-[13px] font-medium"
                style={{
                  color:
                    n.sign === 1
                      ? "#34D399"
                      : n.sign === -1
                        ? "#F87171"
                        : n.amount < 0
                          ? "#F87171"
                          : "#F6F6F6",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {n.sign === 1 ? "+" : n.sign === -1 ? "−" : n.amount < 0 ? "−" : ""}
                {ILS.format(Math.abs(n.amount))}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </section>
  );
}
