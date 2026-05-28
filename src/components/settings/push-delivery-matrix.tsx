"use client";

// Phase 251 — explicit Push delivery matrix.
//
// Apple's iOS PWA Web Push has hard, non-obvious behaviors. Hiding
// them produces "the app feels broken" complaints. This card spells
// out exactly what happens in each phone state + what fallback the
// user actually sees, so expectations match reality and we never
// claim more reliability than iOS provides.

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Info,
  Smartphone,
  XCircle,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { tap } from "@/lib/haptics";

type Row = {
  state: string;
  webPush: "delivered" | "suppressed" | "queued" | "blocked";
  fallback: string;
  userSees: string;
  notes?: string;
};

const ROWS: Row[] = [
  {
    state: "האפליקציה פתוחה ב-Foreground",
    webPush: "suppressed",
    fallback: "טוסט בתוך האפליקציה (sonner)",
    userSees:
      "באנר עליון בעברית — \"חיוב חדש ממתין לאישור\". מופיע מיידית.",
    notes:
      "iOS מבטל Web Push כשה-PWA פעיל — זה התנהגות מערכת, לא באג.",
  },
  {
    state: "האפליקציה ברקע (Tab בStandalone לא בפוקוס)",
    webPush: "delivered",
    fallback: "—",
    userSees:
      "התראת מערכת רגילה. הקשה פותחת את Pulse במסך אישור החיוב.",
  },
  {
    state: "האפליקציה סגורה לחלוטין",
    webPush: "delivered",
    fallback: "—",
    userSees:
      "התראת מערכת. דורש PWA שהותקנה על מסך הבית + iOS 16.4+.",
    notes:
      "אם ה-PWA הוסרה מההום סקרין, Web Push ייעלם כליל.",
  },
  {
    state: "iPhone נעול",
    webPush: "delivered",
    fallback: "—",
    userSees:
      "התראה במסך הנעילה. גוף ההתראה מוצג בהתאם להגדרת תצוגת התראות בנעילה.",
  },
  {
    state: "מצב חיסכון בסוללה (Low Power)",
    webPush: "queued",
    fallback: "התראה תופיע מאוחר",
    userSees:
      "התראות עשויות להגיע במנות (batched). הפעולה תוסיף את הפריט ל-PendingTray ברגע שהאפליקציה תיפתח.",
    notes:
      "iOS דוחה fetch ברקע במצב סוללה נמוכה. אין מה לעשות מצד האפליקציה.",
  },
  {
    state: "הרשאת התראות נדחתה",
    webPush: "blocked",
    fallback: "Pending Tray באפליקציה",
    userSees:
      "אין שום התראת מערכת. הפריט מופיע ב-PendingTray ברגע שהמשתמש פותח את האפליקציה.",
    notes:
      "אפשר לאפשר הרשאה דרך Settings → Notifications → Pulse.",
  },
];

function badge(state: Row["webPush"]) {
  switch (state) {
    case "delivered":
      return { tone: "#34D399", icon: <CheckCircle2 className="size-3" />, label: "מועבר" };
    case "suppressed":
      return { tone: "#60A5FA", icon: <Info className="size-3" />, label: "מוסתר" };
    case "queued":
      return { tone: "#F59E0B", icon: <AlertTriangle className="size-3" />, label: "מתעכב" };
    case "blocked":
      return { tone: "#F87171", icon: <XCircle className="size-3" />, label: "חסום" };
  }
}

export function PushDeliveryMatrix() {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-2xl border border-border/60 bg-surface/50 p-5 backdrop-blur-md">
      <button
        type="button"
        onClick={() => {
          tap();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-start"
      >
        <span className="flex items-center gap-2 text-section text-foreground">
          <Smartphone className="size-4 text-[color:var(--neon)]" />
          התנהגות התראות (לפי מצב iPhone)
        </span>
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
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-3 flex flex-col gap-3">
              <p className="text-caption text-muted-foreground">
                iOS מטפל ב-Web Push לפי מצב המכשיר. למטה מצב לכל
                סיטואציה — ללא הבטחות שווא.
              </p>
              <ul className="flex flex-col gap-2">
                {ROWS.map((r) => {
                  const b = badge(r.webPush);
                  return (
                    <li
                      key={r.state}
                      className="flex flex-col gap-1 rounded-xl border border-white/8 bg-black/25 p-3"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-section text-foreground">
                          {r.state}
                        </span>
                        <span
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-medium"
                          style={{
                            color: b.tone,
                            borderColor: `${b.tone}44`,
                            background: `${b.tone}14`,
                          }}
                        >
                          {b.icon}
                          {b.label}
                        </span>
                      </div>
                      <span className="text-caption text-muted-foreground/85">
                        {r.userSees}
                      </span>
                      <span className="text-caption text-muted-foreground/70">
                        Fallback: {r.fallback}
                      </span>
                      {r.notes ? (
                        <span className="text-caption text-muted-foreground/60">
                          {r.notes}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <p className="text-caption text-muted-foreground/85">
                בכל מצב — אם ההתראה לא הגיעה, הפריט עדיין נשמר
                בשרת ויופיע ב-PendingTray ברגע שהאפליקציה תיפתח. אף
                חיוב לא הולך לאיבוד.
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
