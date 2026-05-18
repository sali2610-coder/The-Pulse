"use client";

import { motion } from "framer-motion";
import { Apple, ArrowLeft, Smartphone, Wallet } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { isStandalonePWA, isIOS } from "@/lib/pwa-detect";
import { PROD_WEBHOOK_URL } from "@/lib/prod-config";
import { getOrCreateDeviceId } from "@/lib/device-id";

import { StepCard, type StepState } from "./step-card";
import { WalletCheatsheet } from "./wallet-cheatsheet";
import { TestConnection } from "./test-connection";
import { WebhookDiagnostics } from "./diagnostics";

type Props = {
  onBack?: () => void;
};

/**
 * Recommended Wallet-first setup flow. Two steps:
 *   1. Install the PWA so Wallet notifications can deep-link back into it.
 *   2. iOS Automation: "When a Notification is Received from Wallet".
 *
 * No personal API token, no manual auth header. The Shortcut sends the
 * browser's device id in the `x-sally-device` header; the webhook routes
 * the write under the signed-in user's namespace if the device is claimed,
 * otherwise under the device namespace.
 */
export function WalletSetupGuide({ onBack }: Props) {
  const hydrated = useFinanceStore((s) => s.hasHydrated);

  if (!hydrated) return null;
  if (typeof window === "undefined") return null;

  const standalone = isStandalonePWA();
  const appleHints = isIOS();
  const webhookUrl = PROD_WEBHOOK_URL;
  const deviceId = getOrCreateDeviceId();

  const pwaState: StepState = standalone ? "done" : "current";
  const walletState: StepState = standalone ? "current" : "pending";

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

      <WalletIntro />

      {/* Step 1 — PWA */}
      <StepCard
        number={1}
        title="התקן כאפליקציה"
        subtitle="חובה ל־Web Push ול־deep-link מהתראת Wallet"
        state={pwaState}
        accent="#A1A1AA"
        icon={<Smartphone className="size-5" />}
      >
        {standalone ? (
          <p className="text-[12px] text-muted-foreground">
            מצוין — האפליקציה רצה במצב standalone.
          </p>
        ) : appleHints ? (
          <ol className="space-y-2 text-[12px] text-muted-foreground">
            <Bullet num="1">
              הקש <Apple className="inline size-3.5" />{" "}
              <strong className="text-foreground">Share</strong> בתחתית Safari.
            </Bullet>
            <Bullet num="2">
              גלול ובחר{" "}
              <strong className="text-foreground">Add to Home Screen</strong>.
            </Bullet>
            <Bullet num="3">
              סגור את Safari ופתח את אייקון <em>Sally</em> מהמסך הראשי.
            </Bullet>
          </ol>
        ) : (
          <p className="text-[12px] text-muted-foreground">
            פתח את העמוד הזה ב־Safari ב־iPhone כדי להתקין. מצב Wallet תומך רק
            ב־iOS 18+.
          </p>
        )}
      </StepCard>

      {/* Step 2 — Wallet Automation */}
      <StepCard
        number={2}
        title="iOS Automation — Wallet Notification"
        subtitle="iOS 18+. כל חיוב Wallet שמגיע — נכנס אוטומטית ל־Pulse"
        state={walletState}
        accent="#00E5FF"
        icon={<Wallet className="size-5" />}
      >
        <WalletSteps />
        <WalletCheatsheet webhookUrl={webhookUrl} deviceId={deviceId} />
        <TestConnection webhookUrl={webhookUrl} deviceId={deviceId} />
      </StepCard>

      <WebhookDiagnostics />
    </div>
  );
}

function WalletIntro() {
  return (
    <motion.section
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-[color:var(--neon)]/30 bg-gradient-to-b from-[color:var(--neon)]/[0.08] to-transparent p-5 backdrop-blur-md"
    >
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-[color:var(--neon)]">
        <Wallet className="size-3.5" /> Wallet-First
      </div>
      <h1 className="mt-2 text-2xl font-light leading-tight tracking-tight text-foreground">
        חבר את Apple Wallet ל־Pulse.
      </h1>
      <p className="mt-2 text-[12px] text-muted-foreground">
        2 שלבים. כל חיוב Apple Pay שיגיע ל־Wallet יקפוץ מיד ב־PendingTray
        לאישור בלחיצה. דורש iOS 18+ עבור הטריגר ”When a Notification is
        Received“. ה־Shortcut מזהה את ה־PWA דרך מזהה המכשיר — בלי טוקנים
        ידניים.
      </p>
    </motion.section>
  );
}

function WalletSteps() {
  return (
    <ol className="space-y-1.5 rounded-2xl border border-white/5 bg-black/20 p-3 text-[12px] text-muted-foreground">
      <Bullet num="1">
        פתח את <strong className="text-foreground">Shortcuts</strong> →{" "}
        <strong className="text-foreground">Automation</strong> →{" "}
        <strong className="text-foreground">+ New Automation</strong>.
      </Bullet>
      <Bullet num="2">
        בחר{" "}
        <strong className="text-foreground">
          When a Notification is Received
        </strong>{" "}
        (iOS 18+). באפליקציות בחר{" "}
        <strong className="text-foreground">Wallet</strong>.
      </Bullet>
      <Bullet num="3">
        סמן{" "}
        <strong className="text-foreground">Run Immediately</strong> +{" "}
        <strong className="text-foreground">Notify When Run</strong> כבוי.
      </Bullet>
      <Bullet num="4">
        הוסף פעולה{" "}
        <strong className="text-foreground">Get Contents of URL</strong>. מלא את
        4 השדות למטה.
      </Bullet>
      <Bullet num="5">
        בשדה{" "}
        <strong className="text-foreground">
          Request Body → notification.body
        </strong>{" "}
        השתמש ב־variable{" "}
        <strong className="text-foreground">Notification Body</strong>.
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
