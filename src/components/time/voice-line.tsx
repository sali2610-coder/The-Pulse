"use client";

// Phase 360 — VoiceLine.
//
// Two-line Hebrew companion voice. Calm. Confident. Present tense.
// Reads like the future is speaking to the user.
//
//   Line 1 — primary fact, context-aware. Calls out סוף חודש and
//            beginning-of-next-month explicitly so the line feels
//            like a financial companion, not a date stamp.
//   Line 2 — softer follow-up tied to the state band.

import { AnimatePresence, motion } from "framer-motion";

import type { ForecastHealth } from "@/lib/forecast-health";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "long",
});

function isEom(cursorISO: string): boolean {
  const d = new Date(cursorISO);
  if (Number.isNaN(d.getTime())) return false;
  const eom = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return d.getDate() === eom.getDate();
}

function whenPhrase(cursorISO: string): string {
  try {
    const d = new Date(cursorISO);
    return `ב־${DAY_FMT.format(d)}`;
  } catch {
    return "בהמשך";
  }
}

function primary(args: {
  band: ForecastHealth["band"];
  balance: number;
  cursorISO: string;
  cursorOffset: number;
}): string {
  const amount = ILS.format(Math.abs(args.balance));
  if (args.cursorOffset === 0) {
    if (args.balance < 0) return `אתה כעת במינוס ${amount}.`;
    return `יש לך כעת ${amount} פנויים.`;
  }
  if (isEom(args.cursorISO)) {
    if (args.balance < 0) {
      return `אתה מסיים את החודש במינוס ${amount}.`;
    }
    return `אתה מסיים את החודש עם ${amount}.`;
  }
  const when = whenPhrase(args.cursorISO);
  if (args.balance < 0) return `${when} אתה במינוס ${amount}.`;
  if (args.band === "safe" || args.band === "steady") {
    return `${when} נשארים לך ${amount} פנויים.`;
  }
  if (args.band === "watch") {
    return `${when} נשארים לך ${amount} בלבד.`;
  }
  return `${when} המאזן עומד על ${amount}.`;
}

function secondary(args: {
  band: ForecastHealth["band"];
  cursorOffset: number;
}): string {
  switch (args.band) {
    case "safe":
      return "כרגע אין סיכון תזרימי.";
    case "steady":
      return args.cursorOffset > 0
        ? "החיובים הקרובים כבר מגולמים בתחזית."
        : "המאזן יציב.";
    case "watch":
      return args.cursorOffset > 14
        ? "לקראת סוף החודש המרווח מצטמצם."
        : "נשאר מרווח, אך הוא מצטמצם.";
    case "risk":
      return "שווה לעצור הוצאות לא חיוניות עד המשכורת.";
    case "danger":
      return "המאזן צפוי לחצות לאדום — שווה לפעול עכשיו.";
    default:
      return "";
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
  if (!health) return null;
  const a = primary({ band: health.band, balance, cursorISO, cursorOffset });
  const b = secondary({ band: health.band, cursorOffset });
  return (
    <div
      className="min-h-[52px] flex flex-col items-center gap-1 px-4 text-center"
      aria-live="polite"
      dir="rtl"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={`a-${a}`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.28 }}
          className="text-[14.5px] font-medium leading-tight text-foreground/92"
        >
          {a}
        </motion.span>
      </AnimatePresence>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={`b-${b}`}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 0.78, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={{ duration: 0.28, delay: 0.04 }}
          className="text-[11.5px] leading-tight text-muted-foreground"
        >
          {b}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
