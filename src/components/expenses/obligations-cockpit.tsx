"use client";

// Phase 372 — Radial Monthly Obligations Cockpit.
//
// Visual control center for "where is my money going this month?"
// Center: pulsing core with the total. Around it: four orbiting
// glass nodes (אשראי / בנק / הלוואות / מזומן), each connected to the
// core by a soft tone-tinted line. Ambient particles inside the
// outer ring + breathing halo — same design language as the Time
// screen so the two screens feel like one product.
//
// Engine math untouched. Reads getMonthlyObligationBreakdown + the
// canonical getCreditCardExposure helpers — single source of truth.
//
// Interaction
// • Tap a node      → opens that lane's bottom sheet.
// • Tap the core    → opens the full-total sheet.
// • Hover/whileTap  → spring scale + tone glow. Selected node stays
//                     raised; the other three dim slightly until
//                     the sheet closes.

import { useMemo, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import {
  Banknote,
  CreditCard,
  Landmark,
  Sparkles,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import {
  getMonthlyObligationBreakdown,
  type MonthlyObligationBreakdown,
  type ObligationLane,
} from "@/lib/monthly-obligation-breakdown";
import {
  getCreditCardExposure,
  type CreditCardExposure,
} from "@/lib/credit-card-exposure";
import { tap as hapticTap } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const LANE_META: Record<
  ObligationLane,
  { label: string; icon: LucideIcon; tone: string; explain: string }
> = {
  creditCards: {
    label: "אשראי",
    icon: CreditCard,
    tone: "#75F5FF",
    explain:
      "אשראי כולל הוצאות קבועות שנספרות על הכרטיס + עסקאות חודשיות. כל חיוב נספר פעם אחת בלבד.",
  },
  bankFixed: {
    label: "בנק",
    icon: Landmark,
    tone: "#F6D970",
    explain:
      "חיובי בנק כוללים הוראות קבע וחיובים ישירים שיורדים מהבנק. הוצאות שמשולמות באשראי לא נספרות פה.",
  },
  loans: {
    label: "הלוואות",
    icon: Banknote,
    tone: "#A78BFA",
    explain:
      "הלוואות נספרות בנפרד כדי למנוע ערבוב. סך התשלום החודשי של כל הלוואה פעילה.",
  },
  cash: {
    label: "מזומן",
    icon: Wallet,
    tone: "#34D399",
    explain:
      "כל המזומן שיוצא החודש — חיובים שסומנו כמזומן + משיכות מזומן שתועדו במערכת.",
  },
};

// SVG canvas dimensions for the radial layer.
const SIZE = 360;
const CORE_R = 90; // core circle radius
const ORBIT_R = 138; // node orbit radius

// Node angles (degrees, 0° = right, clockwise from there). Tweaked
// for visual balance in RTL: אשראי upper-right, בנק upper-left,
// הלוואות lower-left, מזומן lower-right.
const NODE_ANGLE: Record<ObligationLane, number> = {
  creditCards: -45,
  bankFixed: -135,
  loans: 135,
  cash: 45,
};

export function ObligationsCockpit() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const rules = useFinanceStore((s) => s.rules);
  const loans = useFinanceStore((s) => s.loans);
  const entries = useFinanceStore((s) => s.entries);
  const statuses = useFinanceStore((s) => s.statuses);

  const breakdown = useMemo<MonthlyObligationBreakdown | null>(() => {
    if (!hydrated) return null;
    return getMonthlyObligationBreakdown({
      rules,
      loans,
      entries,
      statuses,
      monthKey: currentMonthKey(),
    });
  }, [hydrated, rules, loans, entries, statuses]);

  const exposure = useMemo<CreditCardExposure | null>(() => {
    if (!hydrated) return null;
    return getCreditCardExposure({
      rules,
      entries,
      statuses,
      monthKey: currentMonthKey(),
    });
  }, [hydrated, rules, entries, statuses]);

  const [openLane, setOpenLane] = useState<ObligationLane | "total" | null>(
    null,
  );

  if (!breakdown) {
    return (
      <section className="glass-card flex h-64 animate-pulse rounded-3xl" />
    );
  }

  if (breakdown.total === 0) {
    return (
      <section
        className="glass-card flex flex-col gap-1 rounded-3xl p-4 text-right"
        dir="rtl"
      >
        <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          סך התחייבויות החודש
        </span>
        <span className="text-[13px] text-muted-foreground/85">
          עדיין אין חיובים קבועים מוגדרים. הוסף הוצאה קבועה או הלוואה
          כדי לראות את הסיכום.
        </span>
      </section>
    );
  }

  return (
    <>
      <CockpitCore
        breakdown={breakdown}
        selectedLane={
          openLane === "total" || openLane === null ? null : openLane
        }
        onTapLane={(lane) => {
          hapticTap();
          setOpenLane(lane);
        }}
        onTapCore={() => {
          hapticTap();
          setOpenLane("total");
        }}
      />

      <ObligationDetailSheet
        open={openLane !== null}
        lane={openLane}
        breakdown={breakdown}
        exposure={exposure}
        onOpenChange={(v) => {
          if (!v) setOpenLane(null);
        }}
      />
    </>
  );
}

// ─── Radial cockpit ────────────────────────────────────────────────

function CockpitCore({
  breakdown,
  selectedLane,
  onTapLane,
  onTapCore,
}: {
  breakdown: MonthlyObligationBreakdown;
  selectedLane: ObligationLane | null;
  onTapLane: (lane: ObligationLane) => void;
  onTapCore: () => void;
}) {
  const reduced = useReducedMotion();

  // Largest non-zero lane → drives the ambient tone slightly so the
  // background subtly reflects where the user's pressure lives.
  const lanes: Array<{ id: ObligationLane; amount: number; count: number }> = [
    { id: "creditCards", amount: breakdown.creditCardsTotal, count: breakdown.counts.creditCards },
    { id: "bankFixed", amount: breakdown.bankFixedTotal, count: breakdown.counts.bankFixed },
    { id: "loans", amount: breakdown.loansTotal, count: breakdown.counts.loans },
    { id: "cash", amount: breakdown.cashTotal, count: breakdown.counts.cash },
  ];
  const dominant = [...lanes].sort((a, b) => b.amount - a.amount)[0];
  const ambientTone = dominant.amount > 0
    ? LANE_META[dominant.id].tone
    : "#D4AF37";

  return (
    <section
      className="relative mx-auto w-full max-w-md"
      dir="rtl"
      aria-label="מרכז הפיקוד של ההתחייבויות החודשיות"
    >
      <div
        className="relative mx-auto"
        style={{
          width: "100%",
          aspectRatio: "1 / 1",
          maxWidth: SIZE,
        }}
      >
        {/* Soft ambient backplate */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${ambientTone}1a 0%, ${ambientTone}05 40%, transparent 65%)`,
            transition: "background 700ms ease",
          }}
        />

        {/* Particle ring inside the orbit */}
        {!reduced ? <OrbitParticles tone={ambientTone} /> : null}

        {/* SVG layer — connector lines + outer orbit guide */}
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="absolute inset-0 size-full"
          aria-hidden
        >
          <defs>
            <radialGradient id="cockpit-core-fill" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={`${ambientTone}24`} />
              <stop offset="80%" stopColor={`${ambientTone}06`} />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
            <radialGradient id="cockpit-core-edge" cx="50%" cy="50%" r="50%">
              <stop offset="92%" stopColor="transparent" />
              <stop offset="100%" stopColor={`${ambientTone}55`} />
            </radialGradient>
            <linearGradient
              id="cockpit-orbit"
              x1="0"
              y1="0"
              x2="1"
              y2="1"
            >
              <stop offset="0%" stopColor="rgba(255,255,255,0.10)" />
              <stop offset="50%" stopColor="rgba(255,255,255,0.04)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.10)" />
            </linearGradient>
          </defs>

          {/* Faint outer orbit guide */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={ORBIT_R}
            fill="none"
            stroke="url(#cockpit-orbit)"
            strokeWidth={1}
            strokeDasharray="3 6"
          />

          {/* Soft inner core glow + edge ring */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={CORE_R}
            fill="url(#cockpit-core-fill)"
          />
          <motion.circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={CORE_R}
            fill="none"
            stroke={ambientTone}
            strokeWidth={1.5}
            strokeOpacity={0.55}
            animate={
              reduced
                ? { strokeOpacity: 0.55 }
                : { strokeOpacity: [0.45, 0.85, 0.45] }
            }
            transition={
              reduced
                ? { duration: 0.4 }
                : { duration: 4.6, repeat: Infinity, ease: "easeInOut" }
            }
          />

          {/* Connector lines from core edge → each node */}
          {lanes.map((l) => {
            const angle = (NODE_ANGLE[l.id] * Math.PI) / 180;
            const x1 = SIZE / 2 + Math.cos(angle) * (CORE_R + 4);
            const y1 = SIZE / 2 + Math.sin(angle) * (CORE_R + 4);
            const x2 = SIZE / 2 + Math.cos(angle) * (ORBIT_R - 22);
            const y2 = SIZE / 2 + Math.sin(angle) * (ORBIT_R - 22);
            const tone = LANE_META[l.id].tone;
            const dimmed =
              selectedLane !== null && selectedLane !== l.id;
            const lit = selectedLane === l.id;
            return (
              <motion.line
                key={`connector-${l.id}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={tone}
                strokeWidth={1.4}
                strokeLinecap="round"
                animate={
                  reduced
                    ? { opacity: dimmed ? 0.18 : 0.55 }
                    : {
                        opacity: lit
                          ? [0.6, 1, 0.6]
                          : dimmed
                            ? [0.12, 0.2, 0.12]
                            : [0.35, 0.65, 0.35],
                      }
                }
                transition={
                  reduced
                    ? { duration: 0.3 }
                    : {
                        duration: lit ? 1.8 : 3.2,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }
                }
                style={{
                  filter: lit
                    ? `drop-shadow(0 0 6px ${tone}cc)`
                    : `drop-shadow(0 0 4px ${tone}55)`,
                }}
              />
            );
          })}

          {/* Core edge tone ring (subtle vignette) */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={CORE_R}
            fill="url(#cockpit-core-edge)"
          />
        </svg>

        {/* Core button (center) */}
        <button
          type="button"
          onClick={onTapCore}
          aria-label="פירוט סך החודש"
          className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full text-center transition-transform"
          style={{
            width: CORE_R * 2,
            height: CORE_R * 2,
          }}
        >
          <motion.div
            className="flex flex-col items-center justify-center gap-1.5"
            animate={
              selectedLane !== null && !reduced
                ? { opacity: 0.55, scale: 0.96 }
                : { opacity: 1, scale: 1 }
            }
            transition={{ type: "spring", stiffness: 220, damping: 26 }}
          >
            <span className="inline-flex items-center gap-1 text-[9.5px] uppercase tracking-[0.3em] text-muted-foreground">
              <Sparkles className="size-3 text-gold/80" aria-hidden />
              סך התחייבויות
            </span>
            <SpringAmount
              amount={breakdown.total}
              tone={ambientTone}
              size="hero"
            />
            <span className="text-[10px] text-muted-foreground/80">
              {breakdown.monthKey}
            </span>
          </motion.div>
        </button>

        {/* Orbiting nodes */}
        {lanes.map((l) => {
          const angle = (NODE_ANGLE[l.id] * Math.PI) / 180;
          const cx = SIZE / 2 + Math.cos(angle) * ORBIT_R;
          const cy = SIZE / 2 + Math.sin(angle) * ORBIT_R;
          // Convert to percent of container so the position stays
          // responsive when the box is scaled down on small phones.
          const pctX = (cx / SIZE) * 100;
          const pctY = (cy / SIZE) * 100;
          return (
            <CockpitNode
              key={l.id}
              lane={l.id}
              amount={l.amount}
              count={l.count}
              x={pctX}
              y={pctY}
              dimmed={selectedLane !== null && selectedLane !== l.id}
              selected={selectedLane === l.id}
              onTap={() => onTapLane(l.id)}
            />
          );
        })}
      </div>

      <p
        className="mt-1 text-center text-[10.5px] leading-relaxed text-muted-foreground/80"
        dir="rtl"
      >
        כל חיוב נספר פעם אחת בלבד
      </p>
    </section>
  );
}

function CockpitNode({
  lane,
  amount,
  count,
  x,
  y,
  dimmed,
  selected,
  onTap,
}: {
  lane: ObligationLane;
  amount: number;
  count: number;
  x: number;
  y: number;
  dimmed: boolean;
  selected: boolean;
  onTap: () => void;
}) {
  const meta = LANE_META[lane];
  const inactive = amount === 0;
  return (
    <motion.button
      type="button"
      onClick={onTap}
      whileTap={{ scale: 0.94 }}
      animate={{
        opacity: inactive ? 0.4 : dimmed ? 0.45 : 1,
        scale: selected ? 1.05 : 1,
      }}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
      className="absolute z-20 flex flex-col items-center gap-1 rounded-2xl border border-white/10 bg-black/40 p-2 text-center backdrop-blur-md"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: "translate(-50%, -50%)",
        width: 86,
        boxShadow: selected
          ? `0 0 26px -6px ${meta.tone}88, 0 0 0 1px ${meta.tone}66 inset`
          : inactive
            ? "none"
            : `0 0 18px -10px ${meta.tone}66`,
      }}
      aria-label={`${meta.label} ${count} פריטים`}
      aria-pressed={selected}
    >
      <span
        aria-hidden
        className="flex size-7 items-center justify-center rounded-full"
        style={{ background: `${meta.tone}22`, color: meta.tone }}
      >
        <meta.icon className="size-3.5" />
      </span>
      <span className="text-[10.5px] text-muted-foreground">{meta.label}</span>
      <SpringAmount amount={amount} tone={meta.tone} />
      <span className="text-[9.5px] text-muted-foreground/70">
        {count > 0 ? `${count} פריטים` : "—"}
      </span>
    </motion.button>
  );
}

function OrbitParticles({ tone }: { tone: string }) {
  // Lightweight: 4 dots drifting along the orbit circle, soft trail.
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="pointer-events-none absolute inset-0 size-full"
    >
      <defs>
        <path
          id="cockpit-orbit-path"
          d={`M ${SIZE / 2 + ORBIT_R} ${SIZE / 2} A ${ORBIT_R} ${ORBIT_R} 0 1 1 ${SIZE / 2 - ORBIT_R} ${SIZE / 2} A ${ORBIT_R} ${ORBIT_R} 0 1 1 ${SIZE / 2 + ORBIT_R} ${SIZE / 2}`}
        />
      </defs>
      {[0, 1, 2, 3].map((i) => (
        <motion.circle
          key={i}
          r={1.6}
          fill={tone}
          initial={{ offsetDistance: `${i * 25}%`, opacity: 0 }}
          animate={{
            offsetDistance: [`${i * 25}%`, `${i * 25 + 100}%`],
            opacity: [0, 0.55, 0.55, 0],
          }}
          transition={{
            duration: 14 + i * 0.6,
            repeat: Infinity,
            ease: "linear",
            times: [0, 0.1, 0.9, 1],
          }}
          style={{
            offsetPath: `path("M ${SIZE / 2 + ORBIT_R} ${SIZE / 2} A ${ORBIT_R} ${ORBIT_R} 0 1 1 ${SIZE / 2 - ORBIT_R} ${SIZE / 2} A ${ORBIT_R} ${ORBIT_R} 0 1 1 ${SIZE / 2 + ORBIT_R} ${SIZE / 2}")`,
            filter: `drop-shadow(0 0 5px ${tone})`,
          }}
        />
      ))}
    </svg>
  );
}

function SpringAmount({
  amount,
  tone,
  size = "small",
}: {
  amount: number;
  tone: string;
  size?: "hero" | "small";
}) {
  const mv = useMotionValue(amount);
  const spring = useSpring(mv, { stiffness: 90, damping: 24, mass: 0.5 });
  const text = useTransform(spring, (v) => ILS.format(Math.round(v)));
  mv.set(amount);
  if (size === "hero") {
    return (
      <motion.span
        data-mono="true"
        dir="ltr"
        className="text-[30px] font-light leading-none tracking-tight text-foreground sm:text-[34px]"
        style={{
          fontVariantNumeric: "tabular-nums",
          textShadow: `0 0 24px ${tone}33`,
        }}
      >
        <motion.span>{text}</motion.span>
      </motion.span>
    );
  }
  return (
    <motion.span
      data-mono="true"
      dir="ltr"
      className="text-[12.5px] font-medium leading-none"
      style={{
        color: tone,
        textShadow: `0 0 12px ${tone}33`,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <motion.span>{text}</motion.span>
    </motion.span>
  );
}

// ─── Detail sheet (unchanged behaviour) ───────────────────────────

function ObligationDetailSheet({
  open,
  lane,
  breakdown,
  exposure,
  onOpenChange,
}: {
  open: boolean;
  lane: ObligationLane | "total" | null;
  breakdown: MonthlyObligationBreakdown;
  exposure: CreditCardExposure | null;
  onOpenChange: (v: boolean) => void;
}) {
  const rows =
    lane === null || lane === "total"
      ? breakdown.explanationRows
      : breakdown.explanationRows.filter((r) => r.lane === lane);
  const title =
    lane === "total" || lane === null
      ? "סך התחייבויות החודש"
      : LANE_META[lane].label;
  const explain =
    lane === "total" || lane === null
      ? "זה הסכום שיורד החודש מכל המקורות. כל חיוב נספר פעם אחת בלבד."
      : LANE_META[lane].explain;
  const tone =
    lane === "total" || lane === null ? "#D4AF37" : LANE_META[lane].tone;
  const total =
    lane === "total" || lane === null
      ? breakdown.total
      : lane === "creditCards"
        ? breakdown.creditCardsTotal
        : lane === "bankFixed"
          ? breakdown.bankFixedTotal
          : lane === "loans"
            ? breakdown.loansTotal
            : breakdown.cashTotal;

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={title}>
      <div className="flex flex-col gap-3" dir="rtl">
        <header className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            {title}
          </span>
          <span className="text-[10.5px] text-muted-foreground/80">
            {breakdown.monthKey}
          </span>
        </header>

        <div className="flex items-baseline gap-2">
          <span
            data-mono="true"
            dir="ltr"
            className="text-[34px] font-light leading-none"
            style={{
              color: tone,
              textShadow: `0 0 28px ${tone}44`,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {ILS.format(total)}
          </span>
        </div>

        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          {explain}
        </p>

        {lane === "creditCards" && exposure ? (
          <CreditExposureGrid exposure={exposure} />
        ) : null}

        {rows.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            <AnimatePresence initial={false}>
              {rows.map((r, idx) => (
                <motion.li
                  key={r.id}
                  initial={{ opacity: 0, x: 4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -4 }}
                  transition={{ duration: 0.22, delay: idx * 0.015 }}
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2"
                >
                  <div className="flex flex-1 flex-col gap-0.5">
                    <span className="line-clamp-1 text-[12.5px] text-foreground/90">
                      {r.label}
                    </span>
                    <span className="text-[10.5px] text-muted-foreground">
                      {laneLabel(r.lane)} · {kindLabel(r.kind)}
                    </span>
                  </div>
                  <span
                    data-mono="true"
                    dir="ltr"
                    className="text-[12.5px] font-medium"
                    style={{
                      color: LANE_META[r.lane].tone,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {ILS.format(Math.round(r.amount))}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        ) : (
          <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3 text-center text-[11.5px] text-muted-foreground">
            אין פריטים בלשונית הזו החודש.
          </div>
        )}

        {breakdown.duplicatesPrevented > 0 ? (
          <p className="rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-[10.5px] text-muted-foreground">
            המערכת מנעה {breakdown.duplicatesPrevented} ספירות כפולות
            בחישוב הזה.
          </p>
        ) : null}
      </div>
    </BottomSheet>
  );
}

const EXPOSURE_LABEL: Record<string, string> = {
  futureCardCharges: "חיובים קבועים על הכרטיס",
  existingInstallments: "תשלומים פתוחים",
  walletTransactions: "עסקאות Wallet",
  importedTransactions: "ייבוא / SMS",
  manualCardTransactions: "תיעוד ידני",
  pendingTransactions: "ממתינים לאישור",
};

function CreditExposureGrid({ exposure }: { exposure: CreditCardExposure }) {
  const cells: Array<{ key: keyof CreditCardExposure & string; value: number }> = [
    { key: "futureCardCharges", value: exposure.futureCardCharges },
    { key: "existingInstallments", value: exposure.existingInstallments },
    { key: "walletTransactions", value: exposure.walletTransactions },
    { key: "importedTransactions", value: exposure.importedTransactions },
    { key: "manualCardTransactions", value: exposure.manualCardTransactions },
    { key: "pendingTransactions", value: exposure.pendingTransactions },
  ];
  return (
    <ul className="grid grid-cols-2 gap-1.5" dir="rtl">
      {cells.map((c) => (
        <li
          key={c.key}
          className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] px-2.5 py-2"
        >
          <span className="text-[11px] text-muted-foreground">
            {EXPOSURE_LABEL[c.key]}
          </span>
          <span
            data-mono="true"
            dir="ltr"
            className="text-[12px] font-medium text-foreground"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {ILS.format(c.value)}
          </span>
        </li>
      ))}
      <li className="col-span-2 flex items-center justify-between rounded-xl border border-[#75F5FF]/30 bg-[#75F5FF]/10 px-2.5 py-2">
        <span className="text-[11.5px] font-medium text-foreground">
          סה״כ צפי לכרטיסים
        </span>
        <span
          data-mono="true"
          dir="ltr"
          className="text-[13.5px] font-semibold"
          style={{
            color: "#75F5FF",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {ILS.format(exposure.totalExpectedCharge)}
        </span>
      </li>
    </ul>
  );
}

function laneLabel(l: ObligationLane): string {
  return LANE_META[l].label;
}

function kindLabel(k: "rule" | "loan" | "entry" | "withdrawal"): string {
  switch (k) {
    case "rule":
      return "הוצאה קבועה";
    case "loan":
      return "תשלום הלוואה";
    case "entry":
      return "עסקה";
    case "withdrawal":
      return "משיכה";
    default:
      return "";
  }
}
