"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Apple,
  ArrowLeft,
  KeyRound,
  Smartphone,
  Wallet,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { isStandalonePWA, isIOS } from "@/lib/pwa-detect";
import { AUTH_ENABLED } from "@/lib/auth-config";

import { StepCard, type StepState } from "./step-card";
import { WalletCheatsheet } from "./wallet-cheatsheet";
import { TestConnection } from "./test-connection";
import { WebhookDiagnostics } from "./diagnostics";
import { Button } from "@/components/ui/button";

type TokenState =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "ready"; token: string };

type Props = {
  onBack?: () => void;
};

/**
 * The recommended Wallet-first setup flow. 3 steps:
 *   1. Install the PWA (so notifications can deep-link in)
 *   2. Auth + Personal API Token (combined — token unlocks the webhook)
 *   3. iOS Automation: "When notification is received from Wallet"
 */
export function WalletSetupGuide({ onBack }: Props) {
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

  const standalone = isStandalonePWA();
  const appleHints = isIOS();
  const origin = window.location.origin;
  const token = tokenState.kind === "ready" ? tokenState.token : null;
  const webhookUrl = `${origin}/api/webhooks/transactions`;

  const pwaState: StepState = standalone ? "done" : "current";
  const tokenStepState: StepState =
    tokenState.kind === "ready"
      ? "done"
      : pwaState === "done"
        ? "current"
        : "pending";
  const walletState: StepState =
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

      {/* Step 2 — Token */}
      <StepCard
        number={2}
        title="Personal API Token"
        subtitle="המפתח שמחבר את ה־iPhone שלך ל־Pulse שלך"
        state={tokenStepState}
        accent="#D4AF37"
        icon={<KeyRound className="size-5" />}
      >
        {!AUTH_ENABLED ? (
          <p className="text-[12px] text-muted-foreground">
            האתר רץ במצב single-user. ה־Shortcut ישתמש ב־
            <code className="font-mono">WEBHOOK_SECRET</code> במקום בטוקן.
          </p>
        ) : token ? (
          <div className="space-y-2">
            <TokenChip token={token} />
            <p className="text-[11px] text-muted-foreground">
              שמור את הטוקן ב־iCloud Keychain. תזדקק לו בשלב 3.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[12px] text-muted-foreground">
              עוד לא יצרת טוקן. צור עכשיו והעתק לשלב 3.
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

      {/* Step 3 — Wallet Automation */}
      <StepCard
        number={3}
        title="iOS Automation — Wallet Notification"
        subtitle="iOS 18+. כל חיוב Wallet שמגיע — נכנס אוטומטית ל־Pulse"
        state={walletState}
        accent="#00E5FF"
        icon={<Wallet className="size-5" />}
      >
        <WalletSteps />
        <WalletCheatsheet webhookUrl={webhookUrl} token={token} />
        <TestConnection webhookUrl={webhookUrl} token={token} />
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
        3 שלבים. כל חיוב Apple Pay שיגיע ל־Wallet יקפוץ מיד ב־PendingTray לאישור
        בלחיצה. דורש iOS 18+ עבור הטריגר ”When a Notification is Received“.
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
        <strong className="text-foreground">Request Body → notification.body</strong>{" "}
        השתמש ב־variable{" "}
        <strong className="text-foreground">Notification Body</strong>.
      </Bullet>
    </ol>
  );
}

function TokenChip({ token }: { token: string }) {
  return (
    <div
      data-mono="true"
      dir="ltr"
      className="overflow-x-auto rounded-lg border border-white/5 bg-black/40 px-3 py-2 text-[12px] text-foreground"
    >
      {token}
    </div>
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
