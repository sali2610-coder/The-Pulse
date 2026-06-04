"use client";

// Phase 362 — CashflowRiver (premium polish).
//
// Vertical "story" of how the user reached the cursor balance:
//
//   salary  →  fixed  →  loans  →  cards  →  YOU ARE HERE
//
// Visual language:
//   • One continuous SVG path runs top→bottom through node centers.
//     On mount the path draws itself (stroke-dashoffset spring).
//   • Three light particles drift along the path forever — they
//     read as "money in motion."
//   • Each node row enters with a staggered fade+slide.
//   • Icons breathe softly. The destination ("you") carries a
//     stronger arrival ring + state-tinted halo + double pulse.
//   • Amount numbers spring-count when the value changes (per-row
//     motion values).
//   • Tap a node → reveals a short explanation row.
//
// Reads from existing TimeFrame; engine math untouched.

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import {
  Briefcase,
  ChevronDown,
  CreditCard,
  Landmark,
  Receipt,
  Target,
} from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";

import type { TimeFrame } from "./use-time-engine";
import { STATE_TONE } from "./state-tone";
import { tap as hapticTap } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

type NodeKey = "income" | "fixed" | "loans" | "cards" | "you";
type Sign = 1 | -1 | 0;

type Node = {
  key: NodeKey;
  label: string;
  amount: number;
  sign: Sign;
  Icon: ComponentType<{ className?: string }>;
  /** One short Hebrew sentence — appears when the row is tapped. */
  explain: string;
};

export function CashflowRiver({ frame }: { frame: TimeFrame }) {
  const snap = frame.snapshotEom;
  const tone = STATE_TONE[frame.health?.band ?? "steady"];

  const nodes: Node[] = [];
  if (frame.windowInflow > 0 || (snap?.expectedIncomeUntilNextMonth ?? 0) > 0) {
    nodes.push({
      key: "income",
      label: "משכורת + הכנסות",
      amount:
        frame.windowInflow > 0
          ? frame.windowInflow
          : Math.round(snap?.expectedIncomeUntilNextMonth ?? 0),
      sign: 1,
      Icon: Briefcase,
      explain: "סך ההכנסות הצפויות להיכנס לחשבון בחלון הזמן הזה.",
    });
  }
  if (snap && snap.fixedExpensesUntilNextMonth > 0) {
    nodes.push({
      key: "fixed",
      label: "הוצאות קבועות",
      amount: Math.round(snap.fixedExpensesUntilNextMonth),
      sign: -1,
      Icon: Receipt,
      explain: "הוראות קבע וחיובים חודשיים שכבר ידועים לתקציב.",
    });
  }
  if (snap && snap.activeLoansPaymentsUntilNextMonth > 0) {
    nodes.push({
      key: "loans",
      label: "הלוואות",
      amount: Math.round(snap.activeLoansPaymentsUntilNextMonth),
      sign: -1,
      Icon: Landmark,
      explain: "תשלומים חודשיים על הלוואות פעילות.",
    });
  }
  if (snap && snap.recurringCommitmentsUntilNextMonth > 0) {
    nodes.push({
      key: "cards",
      label: "כרטיסי אשראי",
      amount: Math.round(snap.recurringCommitmentsUntilNextMonth),
      sign: -1,
      Icon: CreditCard,
      explain: "סך החיובים הצפויים מכרטיסי אשראי עד תאריך היעד.",
    });
  }
  nodes.push({
    key: "you",
    label:
      frame.cursorOffset === 0
        ? "המאזן כעת"
        : `אתה כאן · +${frame.cursorOffset} ימים`,
    amount: frame.balance,
    sign: 0,
    Icon: Target,
    explain:
      frame.cursorOffset === 0
        ? "המצב כרגע — סך היתרות הפעילות בחשבונות הבנק."
        : "המאזן הצפוי בתאריך שבחרת, אחרי כל ההכנסות והחיובים שלמעלה.",
  });

  return (
    <section
      className="relative mx-auto w-full max-w-md px-1"
      aria-label="מסלול תזרים מזומנים עד היעד"
      dir="rtl"
    >
      <RiverHeader cursorOffset={frame.cursorOffset} />
      <RiverList nodes={nodes} tone={tone.glow} />
    </section>
  );
}

function RiverHeader({ cursorOffset }: { cursorOffset: number }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-2 px-1">
      <span className="text-[10.5px] uppercase tracking-[0.3em] text-muted-foreground">
        המסלול שלך
      </span>
      <span className="text-[10.5px] text-muted-foreground">
        {cursorOffset === 0 ? "כעת" : `+${cursorOffset} ימים`}
      </span>
    </div>
  );
}

// ─── Internal ─────────────────────────────────────────────────────

const ROW_H = 64; // px between successive node centers
const NODE_DIAM = 44;
const RAIL_LEFT_FROM_RIGHT = 22; // distance of node center from rail right edge

function RiverList({ nodes, tone }: { nodes: Node[]; tone: string }) {
  const [openKey, setOpenKey] = useState<NodeKey | null>(null);

  // Path height = #nodes × ROW_H. Path runs through node centers.
  const height = Math.max(nodes.length * ROW_H, ROW_H);
  const dotCenters = nodes.map((_, i) => i * ROW_H + ROW_H / 2);
  // Build the path as a vertical line through every node center.
  const d =
    `M ${RAIL_LEFT_FROM_RIGHT} ${dotCenters[0]}` +
    dotCenters
      .slice(1)
      .map((y) => ` L ${RAIL_LEFT_FROM_RIGHT} ${y}`)
      .join("");

  return (
    <ol className="relative" style={{ paddingInlineStart: 48 }}>
      {/* Path layer (SVG) — drawn on mount, lit by tone. */}
      <svg
        aria-hidden
        className="pointer-events-none absolute top-0 right-0 h-full"
        width={NODE_DIAM + 4}
        height={height}
        viewBox={`0 0 ${NODE_DIAM + 4} ${height}`}
        style={{ overflow: "visible" }}
      >
        <defs>
          <linearGradient id="riverGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`${tone}80`} />
            <stop offset="100%" stopColor={`${tone}18`} />
          </linearGradient>
        </defs>
        {/* Soft track */}
        <path
          d={d}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
        {/* Animated drawing path */}
        <motion.path
          d={d}
          stroke="url(#riverGrad)"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0.0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{
            pathLength: { type: "spring", stiffness: 60, damping: 18 },
            opacity: { duration: 0.25 },
          }}
        />
        {/* Three traveling light particles — slightly staggered. */}
        {[0, 1, 2].map((i) => (
          <motion.circle
            key={i}
            r={2}
            fill={tone}
            initial={{ offsetDistance: "0%" }}
            animate={{ offsetDistance: ["0%", "100%"] }}
            transition={{
              duration: 5.2 + i * 0.9,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 1.4,
            }}
            style={{
              offsetPath: `path("${d}")`,
              filter: `drop-shadow(0 0 6px ${tone})`,
            }}
          />
        ))}
      </svg>

      {nodes.map((n, i) => {
        const isDest = n.key === "you";
        const open = openKey === n.key;
        return (
          <RiverRow
            key={n.key}
            node={n}
            index={i}
            tone={tone}
            isDest={isDest}
            open={open}
            onToggle={() => {
              hapticTap();
              setOpenKey((prev) => (prev === n.key ? null : n.key));
            }}
          />
        );
      })}
    </ol>
  );
}

function RiverRow({
  node,
  index,
  tone,
  isDest,
  open,
  onToggle,
}: {
  node: Node;
  index: number;
  tone: string;
  isDest: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const delay = 0.18 + index * 0.12;
  const amountColor =
    node.sign === 1
      ? "#34D399"
      : node.sign === -1
        ? "#F87171"
        : node.amount < 0
          ? "#F87171"
          : isDest
            ? tone
            : "#F6F6F6";
  const amountGlow =
    node.sign === 1
      ? "rgba(52,211,153,0.42)"
      : node.sign === -1
        ? "rgba(248,113,113,0.42)"
        : isDest
          ? `${tone}66`
          : "transparent";

  return (
    <li className="relative" style={{ minHeight: ROW_H }}>
      <motion.div
        initial={{ opacity: 0, x: 6 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.36, delay, ease: "easeOut" }}
        className="flex items-center gap-3"
        style={{ minHeight: ROW_H }}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={node.label}
          className="flex flex-1 items-center gap-3 rounded-2xl px-1 py-2 text-right transition-colors"
        >
          {/* Node bubble (over the SVG dot center) */}
          <span
            aria-hidden
            className="relative z-10 flex items-center justify-center rounded-full border"
            style={{
              width: NODE_DIAM,
              height: NODE_DIAM,
              background: isDest
                ? `radial-gradient(circle, ${tone}33 0%, ${tone}10 70%)`
                : "rgba(255,255,255,0.04)",
              borderColor: isDest ? tone : "rgba(255,255,255,0.12)",
              boxShadow: isDest
                ? `0 0 0 1px ${tone}66, 0 0 24px ${tone}55`
                : "none",
              color:
                node.sign === 1
                  ? "#34D399"
                  : node.sign === -1
                    ? "#F87171"
                    : tone,
            }}
          >
            <motion.span
              animate={{ scale: [1, 1.06, 1] }}
              transition={{
                duration: 3.8,
                repeat: Infinity,
                ease: "easeInOut",
                delay: index * 0.2,
              }}
              className="inline-flex"
            >
              <node.Icon className="size-[18px]" />
            </motion.span>

            {/* Destination arrival ping — single soft pulse on entrance */}
            {isDest ? (
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-full"
                initial={{ opacity: 0.0, scale: 1 }}
                animate={{ opacity: [0, 0.55, 0], scale: [1, 1.6, 1.9] }}
                transition={{
                  duration: 1.8,
                  delay: delay + 0.25,
                  ease: "easeOut",
                }}
                style={{ border: `1px solid ${tone}` }}
              />
            ) : null}
          </span>

          <span className="flex flex-1 flex-col gap-0.5 text-right">
            <span className="text-[12.5px] text-foreground/85">
              {node.label}
            </span>
            <AmountNumber
              amount={node.amount}
              sign={node.sign}
              color={amountColor}
              glow={amountGlow}
              isDest={isDest}
              delay={delay + 0.06}
            />
          </span>

          <motion.span
            aria-hidden
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="inline-flex"
          >
            <ChevronDown className="size-3.5 text-muted-foreground/60" />
          </motion.span>
        </button>
      </motion.div>

      {/* Explanation row */}
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            className="overflow-hidden ps-[60px] pe-1"
          >
            <p className="pb-2 text-[11.5px] leading-relaxed text-muted-foreground">
              {node.explain}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

function AmountNumber({
  amount,
  sign,
  color,
  glow,
  isDest,
  delay,
}: {
  amount: number;
  sign: Sign;
  color: string;
  glow: string;
  isDest: boolean;
  delay: number;
}) {
  const mv = useMotionValue(amount);
  const spring = useSpring(mv, { stiffness: 90, damping: 24, mass: 0.5 });
  const text = useTransform(spring, (v) => {
    const n = Math.round(v);
    const prefix =
      sign === 1
        ? "+"
        : sign === -1
          ? "−"
          : n < 0
            ? "−"
            : "";
    return `${prefix}${ILS.format(Math.abs(n))}`;
  });
  useEffect(() => {
    mv.set(amount);
  }, [amount, mv]);

  return (
    <motion.span
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay }}
      data-mono="true"
      dir="ltr"
      className={isDest ? "text-[15px] font-medium" : "text-[13px] font-medium"}
      style={{
        color,
        textShadow: isDest ? `0 0 18px ${glow}` : `0 0 10px ${glow}`,
        fontVariantNumeric: "tabular-nums",
        transition: "color 320ms ease, text-shadow 320ms ease",
      }}
    >
      <motion.span>{text}</motion.span>
    </motion.span>
  );
}
