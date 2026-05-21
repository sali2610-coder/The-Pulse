"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldAlert,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { getOrCreateDeviceId } from "@/lib/device-id";
import { tap } from "@/lib/haptics";

/**
 * Fire a manual cloud backup, wait up to 3s for the response, then
 * resolve regardless. Used before sign-out / account-swap so the
 * user always has a fresh restore point in their own user scope
 * before NextAuth tears down the session.
 *
 * Failures are logged but never block the navigation — backup is a
 * safety net, not a hard barrier between the user and their session
 * controls.
 */
async function safeBackupBeforeNav(
  reason: "pre-sign-in" | "pre-sign-out" | "pre-account-switch" = "pre-sign-out",
): Promise<void> {
  if (typeof window === "undefined") return;
  // 1) ALWAYS capture a local safety snapshot first. This survives
  //    identity changes, network failures, and Zustand re-hydration.
  try {
    const { captureSafetyBackup } = await import(
      "@/lib/local-safety-snapshots"
    );
    const { useFinanceStore } = await import("@/lib/store");
    const s = useFinanceStore.getState();
    captureSafetyBackup(reason, {
      entries: s.entries,
      rules: s.rules,
      statuses: s.statuses,
      accounts: s.accounts,
      loans: s.loans,
      incomes: s.incomes,
      monthlyBudget: s.monthlyBudget,
      lastSyncedAt: s.lastSyncedAt,
      audioEnabled: s.audioEnabled,
    });
  } catch {
    /* local-only — never block nav */
  }
  // 2) Best-effort cloud backup. 3s cap so a slow network never
  //    holds the user hostage.
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    await fetch("/api/backups", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "manual" }),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch {
    /* timeout / offline / 4xx — proceed anyway */
  }
}

type Status = {
  loading: boolean;
  authEnabled: boolean;
  signedIn: boolean;
  email?: string;
  name?: string;
  image?: string;
};

const INITIAL: Status = {
  loading: true,
  authEnabled: false,
  signedIn: false,
};

/** Settings card that surfaces Google sign-in when AUTH is configured,
 *  and reports the active session + claimed device id when signed in. */
export function AuthCard() {
  const [status, setStatus] = useState<Status>(INITIAL);

  // Probe status + session in parallel on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [authRes, sessRes] = await Promise.all([
          fetch("/api/auth/status", { cache: "no-store" }),
          fetch("/api/auth/session", { cache: "no-store" }),
        ]);
        const authJson = (await authRes.json().catch(() => ({}))) as {
          authEnabled?: boolean;
        };
        const sessJson = (await sessRes.json().catch(() => ({}))) as {
          user?: { email?: string; name?: string; image?: string };
        };
        if (cancelled) return;
        setStatus({
          loading: false,
          authEnabled: Boolean(authJson.authEnabled),
          signedIn: Boolean(sessJson.user?.email),
          email: sessJson.user?.email,
          name: sessJson.user?.name,
          image: sessJson.user?.image,
        });
        // Claim this device for the freshly-signed-in user — idempotent.
        if (sessJson.user?.email) {
          try {
            await fetch("/api/auth/claim-device", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ deviceId: getOrCreateDeviceId() }),
              credentials: "same-origin",
            });
          } catch {
            /* claim is best-effort */
          }
        }
      } catch {
        if (!cancelled) setStatus({ ...INITIAL, loading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status.loading) {
    return (
      <section className="rounded-3xl border border-white/8 bg-surface/60 p-5">
        <div className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
          חשבון Sally
        </div>
        <div className="mt-2 h-8 w-32 animate-pulse rounded bg-white/6" />
      </section>
    );
  }

  // Google credentials not configured on this deployment.
  if (!status.authEnabled) {
    return (
      <section className="rounded-3xl border border-white/8 bg-surface/60 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gold/15 text-gold">
            <ShieldAlert className="size-5" />
          </span>
          <div className="flex-1">
            <div className="text-sm font-medium text-foreground">
              חשבון Sally — single-user
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              התחברות עם Google תאופשר ברגע שיוגדרו{" "}
              <code className="font-mono text-foreground/80">AUTH_GOOGLE_ID</code>{" "}
              ו־
              <code className="font-mono text-foreground/80">
                AUTH_GOOGLE_SECRET
              </code>{" "}
              בסביבת ה־Vercel. כל הנתונים שלך נשמרים תחת מזהה המכשיר הזה.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (!status.signedIn) {
    return (
      <section className="rounded-3xl border border-white/8 bg-surface/60 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[color:var(--neon)]/15 text-[color:var(--neon)]">
              <User className="size-5" />
            </span>
            <div>
              <div className="text-sm font-medium text-foreground">
                התחבר ל־Sally
              </div>
              <div className="text-[11px] text-muted-foreground">
                סנכרון בין מכשירים ושמירה תחת חשבון Google.
              </div>
            </div>
          </div>
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={async () => {
              tap();
              toast.message("יוצרים גיבוי לפני התחברות…", {
                duration: 2000,
              });
              await safeBackupBeforeNav("pre-sign-in");
              window.location.href = "/api/auth/signin?callbackUrl=/";
            }}
            className="flex items-center gap-1.5 rounded-full border border-[color:var(--neon)]/40 bg-[color:var(--neon)]/10 px-4 py-2 text-xs font-medium text-[color:var(--neon)] transition-colors hover:bg-[color:var(--neon)]/15"
          >
            <LogIn className="size-3.5" />
            התחבר עם Google
          </motion.button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-[color:#34D399]/40 bg-surface/60 p-5">
      <div className="flex items-start gap-3">
        {status.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={status.image}
            alt=""
            className="size-10 rounded-full border border-white/10"
          />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#34D399]/15 text-[#34D399]">
            <CheckCircle2 className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">
            {status.name ?? status.email}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {status.email}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={async () => {
                tap();
                toast.message("יוצרים גיבוי לפני החלפת חשבון…", {
                  duration: 2500,
                });
                await safeBackupBeforeNav("pre-account-switch");
                window.location.href = "/api/auth/signout?callbackUrl=/";
              }}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-background/40 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-[color:var(--neon)]/40 hover:text-[color:var(--neon)]"
              title="התנתק וחזור לבחור חשבון Google אחר"
            >
              <RefreshCw className="size-3" />
              החלף חשבון Google
            </motion.button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={async () => {
                tap();
                toast.message("יוצרים גיבוי לפני התנתקות…", {
                  duration: 2500,
                });
                await safeBackupBeforeNav();
                window.location.href = "/api/auth/signout?callbackUrl=/";
              }}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-background/40 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
            >
              <LogOut className="size-3" />
              התנתק
            </motion.button>
          </div>
        </div>
      </div>
    </section>
  );
}
