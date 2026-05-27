"use client";

// Phase 247 — iOS Shortcut onboarding wizard.
//
// Step-by-step Hebrew guide for connecting iPhone payment
// notifications → Pulse webhook. Tracks the user's progress
// locally so they can pick up where they left off. Each step has
// a "סיימתי" button that advances the wizard; the final step
// links to the Shortcut-Health card so the user can fire a test
// and watch it land.
//
// No fake Apple Wallet claims. Works inside real iOS constraints:
// notification automation from the Shortcuts app, POST to a
// webhook URL with the user's API token.

import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { tap } from "@/lib/haptics";

type Step = {
  key: string;
  title: string;
  body: string;
  details?: string[];
  copyLabel?: string;
  copyValue?: string;
};

const PROGRESS_KEY = "sally.shortcut-onboarding.step.v1";

function readStep(): number {
  if (typeof window === "undefined") return 0;
  try {
    const v = window.localStorage.getItem(PROGRESS_KEY);
    if (!v) return 0;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeStep(n: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROGRESS_KEY, String(n));
  } catch {
    // Safari private mode — fail silent.
  }
}

export function ShortcutOnboardingCard() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [webhookUrl, setWebhookUrl] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setStep(readStep());
      if (typeof window !== "undefined") {
        setWebhookUrl(`${window.location.origin}/api/webhooks/transactions`);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const exampleBody = JSON.stringify(
    {
      issuer: "shortcut",
      rawText: "Apple Pay · Shufersal · ₪42.90",
      appSource: "wallet",
    },
    null,
    2,
  );

  const steps: Step[] = [
    {
      key: "install",
      title: "1. ודא ש-Pulse על מסך הבית",
      body: "פתח את Sally ב-Safari, לחץ על כפתור השיתוף, ובחר \"Add to Home Screen\". ה-Web Push וההתראות עובדים רק כאשר האפליקציה מותקנת כ-PWA.",
    },
    {
      key: "shortcuts",
      title: "2. פתח את אפליקציית Shortcuts",
      body: "באייפון, פתח את אפליקציית Shortcuts (קיצורים) → לשונית Automation → New Automation.",
    },
    {
      key: "trigger",
      title: "3. בחר טריגר התראה",
      body: "בחר \"When notification received\" וסמן את אפליקציית Wallet (לחיובי Apple Pay) או אפליקציית הבנק/חברת האשראי. סמן \"Run Immediately\" כדי שלא יידרש אישור.",
      details: [
        "iOS מעביר לAutomation את כותרת וגוף ההתראה כפי שהוצגו.",
        "אם Wallet לא מופיע ברשימה, נסה לבחור CAL / MAX / חברת האשראי שלך ישירות.",
      ],
    },
    {
      key: "action",
      title: "4. הוסף פעולת Get Contents of URL",
      body: "בחר Add Action → Web → Get Contents of URL. הגדר Method: POST, Headers: content-type: application/json, Bearer token של Sally.",
    },
    {
      key: "url",
      title: "5. הדבק את כתובת ה-Webhook",
      body: "השתמש בכתובת זו ב-URL:",
      copyLabel: "כתובת Webhook",
      copyValue: webhookUrl,
    },
    {
      key: "body",
      title: "6. הגדר את גוף הבקשה (JSON)",
      body: "Body של הפעולה — JSON. החלף את rawText במשתנה Notification Body של ההתראה (Magic Variable):",
      copyLabel: "JSON לדוגמה",
      copyValue: exampleBody,
    },
    {
      key: "test",
      title: "7. בדוק עם תשלום קטן",
      body: "שלם ₪1 בעסק קרוב או חזור לAutomation ולחץ Play. פתח את Sally → כרטיס \"חיבור קיצור\" → תראה את האירוע מופיע ברשימה תוך שניות.",
    },
  ];

  async function commitStep(next: number) {
    setStep(next);
    writeStep(next);
    tap();
  }

  async function copyValue(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("הועתק");
    } catch {
      toast.error("העתקה נכשלה — סמן ידנית והעתק.");
    }
  }

  const total = steps.length;
  const progress = Math.min(step, total);
  const done = progress >= total;

  return (
    <section className="rounded-2xl border border-border/60 bg-surface/50 p-5 backdrop-blur-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-start"
      >
        <span className="flex items-center gap-2 text-section text-foreground">
          <Sparkles className="size-4 text-[color:var(--neon)]" />
          חיבור תשלום מהאייפון
        </span>
        <span className="text-caption text-muted-foreground/80">
          {done ? "הושלם" : `${progress}/${total}`} {open ? "סגור" : "פתח"}
        </span>
      </button>

      {open ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-body text-muted-foreground">
            Pulse לא יכול לקרוא ישירות עסקאות מ-Apple Wallet — iOS חוסם
            את זה. במקום, אנחנו משתמשים ב-Shortcuts כדי לזהות התראת
            תשלום ולשלוח אותה אלינו. עקוב אחר השלבים — שמירה אוטומטית.
          </p>

          {/* Progress bar */}
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full bg-[color:var(--neon)] transition-all"
              style={{
                width: `${Math.round((progress / total) * 100)}%`,
              }}
            />
          </div>

          <ul className="flex flex-col gap-2">
            {steps.map((s, idx) => {
              const isDone = idx < step;
              const isActive = idx === step;
              return (
                <li
                  key={s.key}
                  className={`overflow-hidden rounded-2xl border ${
                    isActive
                      ? "border-[color:var(--neon)]/50 bg-[color:var(--neon)]/8"
                      : isDone
                        ? "border-white/8 bg-black/15"
                        : "border-white/8 bg-black/25"
                  }`}
                >
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span
                      className={`flex size-7 shrink-0 items-center justify-center rounded-full ${
                        isDone
                          ? "bg-[#34D399]/15 text-[#34D399]"
                          : isActive
                            ? "bg-[color:var(--neon)]/20 text-[color:var(--neon)]"
                            : "bg-white/5 text-muted-foreground"
                      }`}
                    >
                      {isDone ? (
                        <Check className="size-4" />
                      ) : (
                        <span className="text-caption font-medium">
                          {idx + 1}
                        </span>
                      )}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="text-section text-foreground">
                        {s.title}
                      </span>
                      {isActive ? (
                        <span className="text-caption text-muted-foreground">
                          {s.body}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {isActive ? (
                    <div className="flex flex-col gap-3 border-t border-white/8 px-4 py-3">
                      {s.details ? (
                        <ul className="flex list-disc flex-col gap-1 ps-5 text-caption text-muted-foreground/85">
                          {s.details.map((d, i) => (
                            <li key={i}>{d}</li>
                          ))}
                        </ul>
                      ) : null}

                      {s.copyValue ? (
                        <div className="flex flex-col gap-1.5 rounded-xl border border-white/12 bg-black/40 p-2.5">
                          <span className="text-micro text-muted-foreground">
                            {s.copyLabel}
                          </span>
                          <pre
                            dir="ltr"
                            className="overflow-x-auto whitespace-pre-wrap text-caption text-foreground"
                          >
                            {s.copyValue}
                          </pre>
                          <button
                            type="button"
                            onClick={() => copyValue(s.copyValue!)}
                            className="tap-44 self-end inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-caption text-muted-foreground hover:border-white/20 hover:text-foreground"
                          >
                            <Copy className="size-3.5" />
                            העתק
                          </button>
                        </div>
                      ) : null}

                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => commitStep(Math.max(0, step - 1))}
                          disabled={step === 0}
                          className="tap-44 inline-flex items-center gap-1 rounded-md text-caption text-muted-foreground disabled:opacity-30"
                        >
                          <ChevronUp className="size-4 rotate-90" />
                          חזרה
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            commitStep(Math.min(total, step + 1))
                          }
                          className="tap-44 inline-flex items-center gap-1 rounded-md bg-[color:var(--neon)]/15 px-4 py-2 text-body text-[color:var(--neon)] hover:bg-[color:var(--neon)]/25"
                        >
                          סיימתי
                          <ChevronDown className="size-4 -rotate-90" />
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {done ? (
            <div className="flex items-start gap-2 rounded-xl border border-[#34D399]/40 bg-[#34D399]/10 p-3">
              <Check className="mt-0.5 size-4 shrink-0 text-[#34D399]" />
              <div className="flex flex-col gap-1">
                <span className="text-section text-[#34D399]">
                  הקיצור מוכן
                </span>
                <span className="text-caption text-muted-foreground/85">
                  פתח את כרטיס &ldquo;חיבור קיצור (iPhone)&rdquo; כדי לבדוק
                  שהאירועים מגיעים — לחץ &ldquo;שלח בדיקת קיצור&rdquo;.
                </span>
                <button
                  type="button"
                  onClick={() => commitStep(0)}
                  className="tap-44 mt-1 inline-flex items-center gap-1 self-start text-caption text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="size-3.5" />
                  התחל מחדש את ההוראות
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
