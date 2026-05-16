"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Apple,
  ArrowLeft,
  KeyRound,
  Smartphone,
  UserCheck,
  Workflow,
} from "lucide-react";
import { useFinanceStore } from "@/lib/store";
import { isStandalonePWA, isIOS } from "@/lib/pwa-detect";
import { AUTH_ENABLED } from "@/lib/auth-config";

import { StepCard, type StepState } from "./step-card";
import { ShortcutCheatsheet } from "./shortcut-cheatsheet";
import { TestConnection } from "./test-connection";
import { WebhookDiagnostics } from "./diagnostics";
import { CopyChip } from "./copy-chip";
import { Button } from "@/components/ui/button";

type TokenState =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "ready"; token: string };

type SetupGuideProps = {
  onBack?: () => void;
};

export function SetupGuide({ onBack }: SetupGuideProps = {}) {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const [tokenState, setTokenState] = useState<TokenState>(() =>
    AUTH_ENABLED ? { kind: "loading" } : { kind: "none" },
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!AUTH_ENABLED) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/token", {
          credentials: "same-origin",
        });
        if (!res.ok) {
          if (!cancelled) setTokenState({ kind: "none" });
          return;
        }
        const data = (await res.json()) as { token: string | null };
        if (cancelled) return;
        setTokenState(
          data.token ? { kind: "ready", token: data.token } : { kind: "none" },
        );
      } catch {
        if (!cancelled) setTokenState({ kind: "none" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const generateToken = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/auth/token", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { token: string };
      setTokenState({ kind: "ready", token: data.token });
    } finally {
      setBusy(false);
    }
  };

  if (!hydrated) return null;
  if (typeof window === "undefined") return null;

  // Hydrated + on the client — derive client-only values directly.
  const standalone = isStandalonePWA();
  const appleHints = isIOS();
  const origin = window.location.origin;
  const token = tokenState.kind === "ready" ? tokenState.token : null;
  const webhookUrl = `${origin}/api/webhooks/transactions`;

  // Step states.
  const pwaState: StepState = standalone ? "done" : "current";
  const authState: StepState = AUTH_ENABLED ? "done" : "pending";
  const tokenStepState: StepState =
    tokenState.kind === "ready"
      ? "done"
      : pwaState === "done" && authState === "done"
        ? "current"
        : "pending";
  const shortcutState: StepState =
    tokenStepState === "done" ? "current" : "pending";

  return (
    <div className="space-y-4">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          לבחירת מסלול
        </button>
      )}

      <Intro />

      {/* Step 1 — PWA */}
      <StepCard
        number={1}
        title="התקן כאפליקציה"
        subtitle="חובה ל־Web Push ול־Add to Home Screen באייפון"
        state={pwaState}
        accent="#A1A1AA"
        icon={<Smartphone className="size-5" />}
      >
        {standalone ? (
          <p className="text-[12px] text-muted-foreground">
            מצוין — האפליקציה רצה במצב standalone. שלב 1 הושלם.
          </p>
        ) : appleHints ? (
          <ol className="space-y-2 text-[12px] text-muted-foreground">
            <Bullet num="1">
              הקש על אייקון <Apple className="inline size-3.5" />{" "}
              <strong className="text-foreground">Share</strong> בתחתית
              Safari.
            </Bullet>
            <Bullet num="2">
              גלול ובחר{" "}
              <strong className="text-foreground">Add to Home Screen</strong>.
            </Bullet>
            <Bullet num="3">
              אשר את השם <em>Sally</em> ולחץ{" "}
              <strong className="text-foreground">Add</strong>.
            </Bullet>
            <Bullet num="4">
              סגור את Safari ופתח את האייקון מהמסך הראשי.
            </Bullet>
          </ol>
        ) : (
          <p className="text-[12px] text-muted-foreground">
            פתח את העמוד הזה ב־Safari ב־iPhone שלך כדי להתקין את ה־PWA. בדפדפן
            שולחני אפשר לדלג על השלב.
          </p>
        )}
      </StepCard>

      {/* Step 2 — Auth */}
      <StepCard
        number={2}
        title="התחברות"
        subtitle="כל משתמש רואה רק את הנתונים שלו"
        state={authState}
        accent="#00E5FF"
        icon={<UserCheck className="size-5" />}
      >
        {AUTH_ENABLED ? (
          <p className="text-[12px] text-muted-foreground">
            אתה מחובר. ההגדרות, הטוקן, וההיסטוריה שמורים תחת חשבון Clerk שלך
            ולא נגישים למשתמשים אחרים. לסיום הסשן: כפתור הפרופיל למעלה →{" "}
            <strong className="text-foreground">Sign out</strong>.
          </p>
        ) : (
          <p className="text-[12px] text-muted-foreground">
            האתר רץ במצב single-user. כדי להפעיל מצב רב־משתמשים צריך להגדיר את
            Clerk envs ולקבוע{" "}
            <code className="font-mono">NEXT_PUBLIC_AUTH_ENABLED=true</code>.
          </p>
        )}
      </StepCard>

      {/* Step 3 — Personal API Token */}
      <StepCard
        number={3}
        title="Personal API Token"
        subtitle="המפתח האישי שמכניס חיובים ל־Pulse שלך"
        state={tokenStepState}
        accent="#D4AF37"
        icon={<KeyRound className="size-5" />}
      >
        {!AUTH_ENABLED ? (
          <p className="text-[12px] text-muted-foreground">
            דרוש מצב רב־משתמשים (שלב 2). במצב single-user ה־Shortcut משתמש ב־
            <code className="font-mono">WEBHOOK_SECRET</code> הגלובלי במקום
            בטוקן אישי.
          </p>
        ) : token ? (
          <div className="space-y-2">
            <CopyChip label="Bearer Token" value={token} />
            <p className="text-[11px] text-muted-foreground">
              זה הסוד היחיד שמגן על הנתונים שלך. שמור אותו ב־iCloud Keychain
              או ב־Notes מאובטח. רענון יבטל את הישן מיידית.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[12px] text-muted-foreground">
              עוד לא יצרת טוקן. צור עכשיו והעתק לשלב 4.
            </p>
            <Button
              type="button"
              onClick={generateToken}
              disabled={busy}
              className="h-9 bg-gold/90 text-[#0a0a0a] hover:bg-gold"
            >
              צור טוקן
            </Button>
          </div>
        )}
      </StepCard>

      {/* Step 4 — Shortcut */}
      <StepCard
        number={4}
        title="iOS Shortcut"
        subtitle="כל SMS חיוב שמגיע יעבור דרך ההגדרה הזו"
        state={shortcutState}
        accent="#A78BFA"
        icon={<Workflow className="size-5" />}
      >
        <a
          href="/setup/shortcut"
          className="block rounded-2xl border border-[#A78BFA]/40 bg-gradient-to-b from-[#A78BFA]/15 to-[#A78BFA]/[0.02] p-3 transition-colors hover:border-[#A78BFA]/70"
        >
          <div className="flex items-start gap-3">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-xl text-[18px]"
              style={{
                background: "rgba(167, 139, 250, 0.12)",
                color: "#A78BFA",
              }}
            >
              ◇
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-medium text-foreground">
                ויזואל מלא של ה־Shortcut →
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                דף נפרד שמראה איך כל שדה צריך להיראות, עם כפתור העתקה ליד כל
                ערך — מומלץ אם השלבים למטה לא ברורים מספיק.
              </div>
            </div>
          </div>
        </a>
        <ShortcutSteps />
        <ShortcutCheatsheet webhookUrl={webhookUrl} token={token} />
        <TestConnection webhookUrl={webhookUrl} token={token} />
      </StepCard>

      {/* Live diagnostics — last webhook calls + anon ring buffer */}
      <WebhookDiagnostics />
    </div>
  );
}

function Intro() {
  return (
    <motion.section
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-5 backdrop-blur-md"
    >
      <div className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
        SMS fallback · מסלול מתקדם
      </div>
      <h1 className="mt-2 text-2xl font-light leading-tight tracking-tight text-foreground">
        חבר SMS בנק ל־Pulse.
      </h1>
      <p className="mt-2 text-[12px] text-muted-foreground">
        4 שלבים. מומלץ רק כשאין גישה ל־Apple Wallet automation (לדוגמה: iOS
        מתחת ל־18, או חיובים שלא עוברים דרך Apple Pay). בקרוב — תיהנה
        מ־PendingTray עם אישור במגע מכל חיוב SMS שמגיע.
      </p>
    </motion.section>
  );
}

function ShortcutSteps() {
  return (
    <ol className="space-y-1.5 rounded-2xl border border-white/5 bg-black/20 p-3 text-[12px] text-muted-foreground">
      <Bullet num="1">
        פתח את אפליקציית{" "}
        <strong className="text-foreground">Shortcuts</strong> ב־iPhone.
      </Bullet>
      <Bullet num="2">
        עבור ל־<strong className="text-foreground">Automation</strong> →{" "}
        <strong className="text-foreground">+</strong> →{" "}
        <strong className="text-foreground">Message</strong>.
      </Bullet>
      <Bullet num="3">
        בחר את המספר שממנו הבנק שלך שולח SMS, סמן{" "}
        <strong className="text-foreground">Run Immediately</strong>.
      </Bullet>
      <Bullet num="4">
        הוסף פעולה{" "}
        <strong className="text-foreground">Get Contents of URL</strong>{" "}
        ומלא את 4 השדות למטה.
      </Bullet>
      <Bullet num="5">
        בשדה{" "}
        <strong className="text-foreground">Request Body → smsBody</strong>{" "}
        הזן את ה־variable{" "}
        <strong className="text-foreground">Shortcut Input</strong> (הודעה).
      </Bullet>
    </ol>
  );
}

function Bullet({
  num,
  children,
}: {
  num: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2">
      <span
        data-mono="true"
        className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/5 text-[10px] text-foreground"
      >
        {num}
      </span>
      <span>{children}</span>
    </li>
  );
}
