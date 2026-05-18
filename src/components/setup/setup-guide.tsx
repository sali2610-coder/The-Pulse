"use client";

import { motion } from "framer-motion";
import {
  Apple,
  ArrowLeft,
  Smartphone,
  Workflow,
} from "lucide-react";
import { useFinanceStore } from "@/lib/store";
import { isStandalonePWA, isIOS } from "@/lib/pwa-detect";
import { PROD_WEBHOOK_URL } from "@/lib/prod-config";
import { getOrCreateDeviceId } from "@/lib/device-id";

import { StepCard, type StepState } from "./step-card";
import { ShortcutCheatsheet } from "./shortcut-cheatsheet";
import { TestConnection } from "./test-connection";
import { WebhookDiagnostics } from "./diagnostics";

type SetupGuideProps = {
  onBack?: () => void;
};

export function SetupGuide({ onBack }: SetupGuideProps = {}) {
  const hydrated = useFinanceStore((s) => s.hasHydrated);

  if (!hydrated) return null;
  if (typeof window === "undefined") return null;

  const standalone = isStandalonePWA();
  const appleHints = isIOS();
  const webhookUrl = PROD_WEBHOOK_URL;
  const deviceId = getOrCreateDeviceId();

  const pwaState: StepState = standalone ? "done" : "current";
  const shortcutState: StepState = standalone ? "current" : "pending";

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

      {/* Step 2 — Shortcut */}
      <StepCard
        number={2}
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
        <ShortcutCheatsheet webhookUrl={webhookUrl} deviceId={deviceId} />
        <TestConnection webhookUrl={webhookUrl} deviceId={deviceId} />
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
        2 שלבים בלבד. מומלץ רק כשאין גישה ל־Apple Wallet automation (לדוגמה:
        iOS מתחת ל־18, או חיובים שלא עוברים דרך Apple Pay). ה־Shortcut מזהה
        את ה־PWA דרך מזהה המכשיר ושומר את החיובים תחת החשבון שלך — בלי טוקנים
        ידניים.
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
