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
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";

import type { TimeFrame } from "./use-time-engine";
import { VIBE_TONE, vibeFromBalance } from "./state-tone";
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

type CurveTotals = {
  income: number;
  fixed: number;
  loans: number;
  cards: number;
};

const EMPTY: CurveTotals = { income: 0, fixed: 0, loans: 0, cards: 0 };

/** Phase 368 — per-cursor aggregation. Walks the curve points
 *  inclusive of the cursor offset and buckets every signed event by
 *  its kind. Reads the same engine output the ring + voice line
 *  already read; no new math, just a window over events. */
function totalsUpToCursor(frame: TimeFrame): CurveTotals {
  const curve = frame.curve;
  if (!curve) return { ...EMPTY };
  const cap = Math.max(0, Math.min(curve.points.length - 1, frame.cursorOffset));
  let income = 0;
  let fixed = 0;
  let loans = 0;
  let cards = 0;
  // Phase 407 — start at i=0 so LIVE / day-0 events (manual bank
  // withdrawals dated today after the anchor) surface in the "מה
  // השתנה" totals. Pre-Phase-407 the loop started at i=1 so day-0
  // bank impacts were invisible to the explanation path even
  // though the balance correctly reflected them.
  for (let i = 0; i <= cap; i++) {
    for (const ev of curve.points[i].events) {
      if (ev.kind === "income") income += ev.amount;
      else if (ev.kind === "loan") loans += Math.abs(ev.amount);
      else if (ev.kind === "card") cards += Math.abs(ev.amount);
      else if (ev.kind === "bank_debit") fixed += Math.abs(ev.amount);
    }
  }
  return {
    income: Math.round(income),
    fixed: Math.round(fixed),
    loans: Math.round(loans),
    cards: Math.round(cards),
  };
}

export function CashflowRiver({ frame }: { frame: TimeFrame }) {
  const tone = VIBE_TONE[vibeFromBalance(frame.balance)];

  // Phase 368 — totals come from the curve windowed by cursor so
  // every checkpoint tells a different story. Snapshot was a flat
  // EOM total; new totals react to LIVE / 10 / EOM / 2 / +10
  // exactly the way the balance does.
  const totals = useMemo(() => totalsUpToCursor(frame), [frame]);

  // Phase 426 — itemized per-event list so the diff strip shows
  // each loan / rule / income individually instead of collapsing
  // them into a single "תשלומי הלוואות -3,570" aggregate. Walks
  // events from day 0 up to and including the cursor day.
  const itemized = useMemo(() => {
    const curve = frame.curve;
    if (!curve) return [] as Array<{ label: string; amount: number; kind: "income" | "loan" | "card" | "bank_debit"; informational?: boolean; whenISO: string }>;
    const cap = Math.max(0, Math.min(curve.points.length - 1, frame.cursorOffset));
    const out: Array<{ label: string; amount: number; kind: "income" | "loan" | "card" | "bank_debit"; informational?: boolean; whenISO: string }> = [];
    for (let i = 0; i <= cap; i++) {
      for (const ev of curve.points[i].events) {
        if (ev.kind !== "income" && ev.kind !== "loan" && ev.kind !== "card" && ev.kind !== "bank_debit") continue;
        out.push({
          label: ev.label,
          amount: ev.amount,
          kind: ev.kind,
          informational: ev.informational,
          whenISO: ev.whenISO,
        });
      }
    }
    out.sort(
      (a, b) => new Date(a.whenISO).getTime() - new Date(b.whenISO).getTime(),
    );
    return out;
  }, [frame.curve, frame.cursorOffset]);

  // Track previous totals so the change-summary strip can describe
  // the diff between the last cursor and this one.
  const prevTotalsRef = useRef<CurveTotals>(EMPTY);
  const [diff, setDiff] = useState<CurveTotals>(EMPTY);
  useEffect(() => {
    const prev = prevTotalsRef.current;
    setDiff({
      income: totals.income - prev.income,
      fixed: totals.fixed - prev.fixed,
      loans: totals.loans - prev.loans,
      cards: totals.cards - prev.cards,
    });
    prevTotalsRef.current = totals;
  }, [totals]);

  const nodes: Node[] = [
    {
      key: "income",
      label: "משכורת + הכנסות",
      amount: totals.income,
      sign: 1,
      Icon: Briefcase,
      explain:
        "סך ההכנסות שכבר נספרו בטווח התאריך הזה. עוברים לתאריך מאוחר יותר כדי לראות הכנסות שטרם הגיעו.",
    },
    {
      key: "fixed",
      label: "הוצאות קבועות",
      amount: totals.fixed,
      sign: -1,
      Icon: Receipt,
      explain:
        "הוראות קבע וחיובים ישירים מהבנק שהצטברו עד התאריך שבחרת.",
    },
    {
      key: "loans",
      label: "הלוואות",
      amount: totals.loans,
      sign: -1,
      Icon: Landmark,
      explain:
        "תשלומי הלוואה חודשיים שהשפיעו על הבנק עד התאריך שבחרת.",
    },
    {
      key: "cards",
      label: "כרטיסי אשראי",
      amount: totals.cards,
      sign: -1,
      Icon: CreditCard,
      explain:
        "סך החיובים בכרטיסי אשראי שכבר הגיעו לבנק עד התאריך שבחרת.",
    },
    {
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
          : "המאזן הצפוי בתאריך שבחרת, אחרי ההכנסות והחיובים שלמעלה.",
    },
  ];

  return (
    <section
      className="relative mx-auto w-full max-w-md px-1"
      aria-label="מסלול תזרים מזומנים עד היעד"
      dir="rtl"
    >
      <RiverHeader cursorOffset={frame.cursorOffset} />
      <ChangeSummary
        diff={diff}
        itemized={itemized}
        /* Phase 427 — LIVE stays itemized so each past loan / rule is
           visible by name. Future chips (10 / EOM / 2 next / 10 next /
           custom) collapse into three group lines (bank / loans /
           credit) because itemizing 20+ future events overwhelms the
           strip and the user can't see "what hits this card". */
        groupOnly={frame.cursorOffset > 0}
        tone={tone.glow}
      />
      <RiverList
        nodes={nodes}
        tone={tone.glow}
        cursorOffset={frame.cursorOffset}
      />
    </section>
  );
}

function ChangeSummary({
  diff,
  itemized,
  groupOnly,
  tone,
}: {
  diff: CurveTotals;
  /** Phase 426 — per-event breakdown so each loan/rule line is
   *  visible by name + amount instead of being collapsed into a
   *  single "תשלומי הלוואות" aggregate. Used only when groupOnly is
   *  false (LIVE chip). */
  itemized: Array<{ label: string; amount: number; kind: "income" | "loan" | "card" | "bank_debit"; informational?: boolean }>;
  /** Phase 427 — when true, render aggregated group lines only
   *  (Bank / Loans / Credit / Income). Future chips (10 / EOM /
   *  2 next / 10 next / custom) set this so the strip stays
   *  scannable instead of listing dozens of events. */
  groupOnly: boolean;
  tone: string;
}) {
  type DiffLine = {
    sign: 1 | -1;
    amount: number;
    label: string;
    informational?: boolean;
  };
  const lines: DiffLine[] = [];
  if (!groupOnly && itemized.length > 0) {
    // LIVE — per-event rendering. Each loan / rule on its own line
    // so "Car -870" and "Studies -2,700" are both visible — never
    // collapsed into a single number.
    for (const it of itemized) {
      lines.push({
        sign: it.kind === "income" ? 1 : -1,
        amount: Math.abs(it.amount),
        label: it.label,
        informational: it.informational,
      });
    }
  } else {
    // Future chips — collapse into Bank / Loans / Credit / Income
    // groups so the user reads what hits each lane at a glance.
    if (diff.income > 0) {
      lines.push({ sign: 1, amount: diff.income, label: "הכנסות" });
    } else if (diff.income < 0) {
      lines.push({ sign: -1, amount: Math.abs(diff.income), label: "הוסרה הכנסה" });
    }
    if (diff.fixed > 0) {
      lines.push({ sign: -1, amount: diff.fixed, label: "בנק — חיובים קבועים" });
    }
    if (diff.loans > 0) {
      lines.push({ sign: -1, amount: diff.loans, label: "הלוואות" });
    }
    if (diff.cards > 0) {
      lines.push({ sign: -1, amount: diff.cards, label: "אשראי" });
    }
  }
  return (
    <div
      aria-label="מה השתנה מאז התאריך הקודם"
      className="mb-3 min-h-[44px]"
      dir="rtl"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {lines.length === 0 ? (
          <motion.div
            key="quiet"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 0.65, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.24 }}
            className="rounded-2xl border border-white/8 bg-white/[0.02] px-3 py-2 text-[11px] text-muted-foreground"
            style={{ boxShadow: `inset 0 0 22px -10px ${tone}33` }}
          >
            עדיין לא חלו שינויים מאז התאריך הקודם
          </motion.div>
        ) : (
          <motion.ul
            key={lines.map((l) => `${l.sign}${l.amount}${l.label}`).join("|")}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.28 }}
            className="flex flex-col gap-1 rounded-2xl border border-white/8 bg-white/[0.02] px-3 py-2"
            style={{ boxShadow: `inset 0 0 22px -10px ${tone}33` }}
          >
            <li className="text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground">
              מה השתנה מאז התאריך הקודם
            </li>
            {lines.map((l, i) => (
              <li
                key={`${i}-${l.label}`}
                className="flex items-center justify-between text-[12.5px]"
              >
                <span
                  className="text-foreground/80"
                  style={l.informational ? { opacity: 0.75 } : undefined}
                >
                  {l.label}
                  {l.informational ? (
                    <span className="ms-1 text-[10px] text-muted-foreground/80">
                      · כבר ביתרה
                    </span>
                  ) : null}
                </span>
                <span
                  data-mono="true"
                  dir="ltr"
                  className="font-medium"
                  style={{
                    color: l.sign === 1 ? "#34D399" : "#F87171",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {l.sign === 1 ? "+" : "−"}
                  {ILS.format(l.amount)}
                </span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
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

function RiverList({
  nodes,
  tone,
  cursorOffset,
}: {
  nodes: Node[];
  tone: string;
  cursorOffset: number;
}) {
  const [openKey, setOpenKey] = useState<NodeKey | null>(null);
  const [waveKey, setWaveKey] = useState(0);
  const prevCursorRef = useRef(cursorOffset);
  useEffect(() => {
    if (prevCursorRef.current !== cursorOffset) {
      prevCursorRef.current = cursorOffset;
      setWaveKey((k) => k + 1);
    }
  }, [cursorOffset]);

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

        {/* Phase 364 — pulse wave: on every cursor change a bright
            particle runs once down the path, visually connecting
            the checkpoint choice to the destination. */}
        <motion.circle
          key={`wave-${waveKey}`}
          r={3.4}
          fill="#FFFFFF"
          initial={{ offsetDistance: "0%", opacity: 0 }}
          animate={{
            offsetDistance: ["0%", "100%"],
            opacity: [0, 1, 1, 0],
          }}
          transition={{ duration: 0.95, ease: "easeOut", times: [0, 0.1, 0.85, 1] }}
          style={{
            offsetPath: `path("${d}")`,
            filter: `drop-shadow(0 0 10px ${tone})`,
          }}
        />
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
            arrivalKey={isDest ? waveKey : 0}
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
  arrivalKey,
  onToggle,
}: {
  node: Node;
  index: number;
  tone: string;
  isDest: boolean;
  open: boolean;
  arrivalKey: number;
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

  // Phase 368 — inactive rows (no events yet contributed to this
  // category) read as dimmed + semi-transparent. Destination stays
  // fully opaque regardless of zero, so the "you are here" anchor
  // never disappears.
  const inactive = !isDest && Math.abs(node.amount) < 1;

  return (
    <li className="relative" style={{ minHeight: ROW_H }}>
      <motion.div
        initial={{ opacity: 0, x: 6 }}
        animate={{ opacity: inactive ? 0.42 : 1, x: 0 }}
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

            {/* Destination arrival ping — re-fires every time the
                cursor changes (waveKey re-keys the element). */}
            {isDest ? (
              <motion.span
                key={`arr-${arrivalKey}`}
                aria-hidden
                className="absolute inset-0 rounded-full"
                initial={{ opacity: 0.0, scale: 1 }}
                animate={{ opacity: [0, 0.55, 0], scale: [1, 1.6, 1.9] }}
                transition={{
                  duration: 1.6,
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
