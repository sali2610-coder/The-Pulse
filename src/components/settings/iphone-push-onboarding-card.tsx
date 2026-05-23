"use client";

// iPhone-first Web Push onboarding card.
//
// Walks the user through the four checks that need to pass before
// iOS Safari will deliver a Web Push to the installed PWA. Reuses
// existing primitives (SectionHeader, InsightChip, CardEmpty) so
// the visual tone matches the rest of Settings.
//
// Pure UI shell over `iphonePushOnboardingReport` so the rules
// stay testable + headless.

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Circle,
  CircleDot,
  Smartphone,
} from "lucide-react";

import { isIOS, isStandalonePWA } from "@/lib/pwa-detect";
import {
  iphonePushOnboardingReport,
  type IphoneStep,
  type IphoneStepStatus,
} from "@/lib/iphone-push-onboarding";
import { SectionHeader } from "@/components/ui/section-header";
import {
  InsightChip,
  type InsightSeverity,
} from "@/components/ui/insight-chip";
import { listReveal } from "@/lib/motion-tokens";

const STATUS_ICON: Record<IphoneStepStatus, React.ReactNode> = {
  done: <CheckCircle2 className="size-4 text-[#34D399]" aria-hidden />,
  current: <CircleDot className="size-4 text-[color:var(--neon)]" aria-hidden />,
  pending: <Circle className="size-4 text-muted-foreground/70" aria-hidden />,
  blocked: <AlertTriangle className="size-4 text-destructive" aria-hidden />,
  skipped: <Circle className="size-4 text-muted-foreground/40" aria-hidden />,
};

const HEADER_SEV: Record<string, InsightSeverity> = {
  "התראות מוכנות": "info",
  "ממתין להשלמה": "watch",
  "צריך התערבות": "warn",
};

type Probe = {
  isIOSDevice: boolean;
  isStandalone: boolean;
  notificationPermission: NotificationPermission | "unsupported" | null;
  hasSubscription: boolean;
  isForeground: boolean;
};

const INITIAL: Probe = {
  isIOSDevice: false,
  isStandalone: false,
  notificationPermission: null,
  hasSubscription: false,
  isForeground: true,
};

async function probeIphoneOnboarding(): Promise<Probe> {
  if (typeof window === "undefined") return INITIAL;
  const isIOSDevice = isIOS();
  const isStandalone = isStandalonePWA();
  const notificationPermission: NotificationPermission | "unsupported" =
    "Notification" in window ? Notification.permission : "unsupported";

  let hasSubscription = false;
  if ("serviceWorker" in navigator) {
    try {
      // Race each SW call against a 3s budget so a stuck plugin can't
      // strand the card the way push-toggle used to.
      const reg = await Promise.race([
        navigator.serviceWorker.getRegistration(),
        new Promise<undefined>((resolve) =>
          setTimeout(() => resolve(undefined), 3000),
        ),
      ]);
      if (reg) {
        const sub = await Promise.race([
          reg.pushManager.getSubscription().catch(() => null),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ]);
        hasSubscription = Boolean(sub);
      }
    } catch {
      /* ignore */
    }
  }

  return {
    isIOSDevice,
    isStandalone,
    notificationPermission,
    hasSubscription,
    isForeground:
      typeof document !== "undefined"
        ? document.visibilityState === "visible"
        : true,
  };
}

export function IphonePushOnboardingCard() {
  const [probe, setProbe] = useState<Probe>(INITIAL);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const next = await probeIphoneOnboarding();
      if (cancelled) return;
      setProbe(next);
      setReady(true);
    };
    void run();
    const onVisible = () => {
      void run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!ready) {
    return (
      <section className="rounded-2xl border border-border/60 bg-surface/50 p-5 backdrop-blur-md">
        <SectionHeader icon={<Smartphone />} title="התראות באייפון" />
        <p className="mt-3 text-[11px] text-muted-foreground">בודק מצב…</p>
      </section>
    );
  }

  const report = iphonePushOnboardingReport({
    isIOS: probe.isIOSDevice,
    isStandalone: probe.isStandalone,
    notificationPermission: probe.notificationPermission,
    hasSubscription: probe.hasSubscription,
    isForeground: probe.isForeground,
  });

  return (
    <section className="rounded-2xl border border-border/60 bg-surface/50 p-5 backdrop-blur-md">
      <SectionHeader
        icon={<Smartphone />}
        title="התראות באייפון (PWA)"
        trailing={
          <InsightChip
            severity={HEADER_SEV[report.headerLabel] ?? "info"}
            icon={<Bell className="size-2.5" />}
            label={report.headerLabel}
          />
        }
      />

      <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
        אנחנו עובדים עם Web Push חינמי של iOS, לא עם APNs נטיב. כדי שזה
        יעבוד, חובה להתקין את האפליקציה למסך הבית באייפון. ארבעת השלבים
        למטה מראים בדיוק מה עוד חסר.
      </p>

      <ol className="mt-3 flex flex-col gap-1.5">
        {report.steps.map((step, idx) => (
          <StepRow key={step.kind} step={step} index={idx} />
        ))}
      </ol>

      {report.foregroundNote ? (
        <p className="mt-3 rounded-xl border border-gold/30 bg-gold/10 px-3 py-2 text-[11px] text-gold">
          {report.foregroundNote}
        </p>
      ) : null}

      <p className="mt-3 text-[10px] text-muted-foreground/80">
        APNs נטיב דרך Apple Developer Program הוא Phase עתידי. כל הזמן
        שאנחנו על Web Push, הצעדים כאן הם מה שצריך לוודא.
      </p>
    </section>
  );
}

function StepRow({ step, index }: { step: IphoneStep; index: number }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={listReveal(index)}
      className="flex items-start gap-2 rounded-xl border border-white/8 bg-black/25 p-2.5"
    >
      <div className="mt-0.5">{STATUS_ICON[step.status]}</div>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span
          className={`text-[12px] font-medium ${
            step.status === "done"
              ? "text-foreground"
              : step.status === "blocked"
                ? "text-destructive"
                : step.status === "skipped"
                  ? "text-muted-foreground/70"
                  : "text-foreground"
          }`}
        >
          {step.title}
        </span>
        <span className="text-[11px] leading-snug text-muted-foreground/90">
          {step.description}
        </span>
        {step.hint ? (
          <span
            className={`mt-1 text-[10.5px] ${
              step.status === "blocked"
                ? "text-destructive/85"
                : "text-muted-foreground/85"
            }`}
          >
            {step.hint}
          </span>
        ) : null}
      </div>
    </motion.li>
  );
}
