"use client";

// Phase 358 / D — VoiceLine.
//
// One Hebrew sentence in present tense as if the user IS on the
// cursor date. Crossfades when the band or balance changes.

import { AnimatePresence, motion } from "framer-motion";

import type { ForecastHealth } from "@/lib/forecast-health";

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

function sentence(args: {
  band: ForecastHealth["band"];
  balance: number;
  cursorISO: string;
  cursorOffset: number;
}): string {
  const dayLabel =
    args.cursorOffset === 0 ? "היום" : DAY_FMT.format(new Date(args.cursorISO));
  const amount = ILS.format(Math.abs(args.balance));
  if (args.balance < 0) {
    return `מינוס ${amount} ב${dayLabel}. עצור.`;
  }
  switch (args.band) {
    case "safe":
      return `יש לך ${amount} ב${dayLabel}. שקט.`;
    case "steady":
      return `המאזן עומד על ${amount} ב${dayLabel}. יציב.`;
    case "watch":
      return `נשארו ${amount} ב${dayLabel}. מתוח.`;
    case "risk":
      return `הגעת ל-${amount} ב${dayLabel}. צר.`;
    case "danger":
      return `הגעת ל-${amount} ב${dayLabel}. עצור.`;
    default:
      return `המאזן עומד על ${amount} ב${dayLabel}.`;
  }
}

export function VoiceLine({
  health,
  balance,
  cursorISO,
  cursorOffset,
}: {
  health: ForecastHealth | null;
  balance: number;
  cursorISO: string;
  cursorOffset: number;
}) {
  const text = health
    ? sentence({ band: health.band, balance, cursorISO, cursorOffset })
    : "";
  return (
    <div className="min-h-[28px] text-center" aria-live="polite">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={text}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.24 }}
          className="text-[13.5px] text-foreground/80"
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
