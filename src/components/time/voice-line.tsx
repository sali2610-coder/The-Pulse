"use client";

// Phase 359 — VoiceLine (premium polish).
//
// Two-line Hebrew companion voice. Speaks naturally, present tense,
// no spreadsheet vibes.
//
//   Line 1 — primary fact ("ב־10 ביולי נשארים לך 3,240 ₪ פנויים.")
//   Line 2 — context ("אתה עדיין באזור יציב." / "המרווח מצטמצם.")
//
// Both crossfade when state or balance changes.

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

// Phase 359 — Hebrew month name prefixed with ב־ so the sentence
// reads "ב־10 ביולי" naturally. Falls back to the locale string if
// for any reason the date is bad.
function whenPhrase(cursorISO: string, cursorOffset: number): string {
  if (cursorOffset === 0) return "היום";
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
  const when = whenPhrase(args.cursorISO, args.cursorOffset);
  const amount = ILS.format(Math.abs(args.balance));
  if (args.balance < 0) return `${when} אתה במינוס ${amount}.`;
  if (args.cursorOffset === 0) return `יש לך כעת ${amount} פנויים.`;
  if (args.band === "safe" || args.band === "steady") {
    return `${when} נשארים לך ${amount} פנויים.`;
  }
  if (args.band === "watch") return `${when} נשארים לך ${amount} בלבד.`;
  return `${when} המאזן עומד על ${amount}.`;
}

function secondary(args: {
  band: ForecastHealth["band"];
  cursorOffset: number;
}): string {
  switch (args.band) {
    case "safe":
      return "יש מספיק מרווח עד המשכורת הבאה.";
    case "steady":
      return "אתה עדיין באזור יציב.";
    case "watch":
      return args.cursorOffset > 14
        ? "לקראת סוף החודש המרווח מצטמצם."
        : "המרווח מתחיל להצטמצם.";
    case "risk":
      return "המרווח קטן — שווה לעצור הוצאות לא חיוניות.";
    case "danger":
      return "המאזן צפוי לחצות לאדום. שווה לפעול עכשיו.";
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
      className="min-h-[48px] flex flex-col items-center gap-1 text-center"
      aria-live="polite"
      dir="rtl"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={`a-${a}`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.26 }}
          className="text-[14px] font-medium text-foreground/90"
        >
          {a}
        </motion.span>
      </AnimatePresence>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={`b-${b}`}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 0.8, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={{ duration: 0.26, delay: 0.04 }}
          className="text-[11.5px] text-muted-foreground"
        >
          {b}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
