"use client";

import { motion } from "framer-motion";
import { Activity, TrendingUp, Wallet } from "lucide-react";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Pill } from "@/components/ui/pill";

type PulseStatusKey = "idle" | "green" | "yellow" | "red" | "over";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actual: number;
  projected: number;
  budget: number;
  benchmark: number;
  status: PulseStatusKey;
};

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const STATUS_META: Record<
  PulseStatusKey,
  { tone: "green" | "neon" | "gold" | "red" | "neutral"; label: string }
> = {
  idle: { tone: "neutral", label: "עוד אין יעד" },
  green: { tone: "green", label: "בקצב טוב" },
  yellow: { tone: "gold", label: "כדאי לעקוב" },
  red: { tone: "red", label: "מתקרב ליעד" },
  over: { tone: "red", label: "חריגה בפועל" },
};

export function PulseExplainerSheet({
  open,
  onOpenChange,
  actual,
  projected,
  budget,
  benchmark,
  status,
}: Props) {
  const meta = STATUS_META[status];
  const futureSlice = Math.max(0, projected - actual);
  const remaining = Math.max(0, budget - projected);
  const overshoot = Math.max(0, projected - budget);

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="The Pulse">
      <header className="flex items-start justify-between gap-3 pb-1">
        <div className="flex flex-col text-right">
          <h2 className="text-lg font-semibold text-foreground">איך מחושב</h2>
          <span className="text-[11px] text-muted-foreground">
            הסבר חי על המספרים שאתה רואה ב-Pulse
          </span>
        </div>
        <Pill tone={meta.tone}>{meta.label}</Pill>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <Tile
          label="בפועל"
          value={ILS.format(actual)}
          tone="red"
          icon={<Wallet className="size-3" />}
        />
        <Tile
          label="צפי לסוף חודש"
          value={ILS.format(projected)}
          tone="gold"
          icon={<TrendingUp className="size-3" />}
        />
        <Tile
          label="יעד תקציב"
          value={ILS.format(budget)}
          tone="neutral"
        />
        <Tile
          label="חודש קודם באותו יום"
          value={ILS.format(benchmark)}
          tone="purple"
          icon={<Activity className="size-3" />}
        />
      </div>

      <motion.section
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-2 rounded-2xl border border-white/8 bg-black/30 p-3"
      >
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          הרכב הצפי
        </div>
        <FormulaRow label="הוצאת עד עכשיו" value={actual} />
        <FormulaRow label="חיובים עתידיים החודש" value={futureSlice} />
        <FormulaRow
          label="סה״כ צפי"
          value={projected}
          emphasis
        />
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="flex flex-col gap-1.5 rounded-2xl border border-white/8 bg-black/30 p-3"
      >
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          מול תקציב
        </div>
        {budget > 0 ? (
          overshoot > 0 ? (
            <p className="text-[12px] leading-relaxed text-destructive">
              חריגה צפויה של{" "}
              <span data-mono="true" dir="ltr" className="font-semibold">
                {ILS.format(overshoot)}
              </span>{" "}
              מעבר ליעד שלך.
            </p>
          ) : (
            <p className="text-[12px] leading-relaxed text-foreground/85">
              נותר לך מרווח של{" "}
              <span data-mono="true" dir="ltr" className="font-semibold">
                {ILS.format(remaining)}
              </span>{" "}
              עד הגעה ליעד התקציב.
            </p>
          )
        ) : (
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            עוד לא הגדרת תקציב חודשי — כשתגדיר, יופיע כאן יחס מול היעד.
          </p>
        )}
      </motion.section>
    </BottomSheet>
  );
}

function Tile({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: "neutral" | "neon" | "gold" | "green" | "red" | "purple";
  icon?: React.ReactNode;
}) {
  const accent: Record<string, string> = {
    neutral: "#E4E7EC",
    neon: "#00E5FF",
    gold: "#D4AF37",
    green: "#34D399",
    red: "#F87171",
    purple: "#A78BFA",
  };
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-white/8 bg-black/30 p-3">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {icon}
        {label}
      </span>
      <span
        data-mono="true"
        dir="ltr"
        className="text-base font-semibold"
        style={{ color: accent[tone] }}
      >
        {value}
      </span>
    </div>
  );
}

function FormulaRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between text-[12px] ${
        emphasis ? "border-t border-white/8 pt-1.5 text-foreground" : "text-muted-foreground"
      }`}
    >
      <span>{label}</span>
      <span
        data-mono="true"
        dir="ltr"
        className={emphasis ? "font-semibold text-foreground" : "text-foreground/85"}
      >
        {ILS.format(value)}
      </span>
    </div>
  );
}
