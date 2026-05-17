"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, LogIn, LogOut, ShieldAlert, User } from "lucide-react";

import { getOrCreateDeviceId } from "@/lib/device-id";
import { tap } from "@/lib/haptics";

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
          <motion.a
            whileTap={{ scale: 0.96 }}
            href="/api/auth/signin?callbackUrl=/"
            onClick={() => tap()}
            className="flex items-center gap-1.5 rounded-full border border-[color:var(--neon)]/40 bg-[color:var(--neon)]/10 px-4 py-2 text-xs font-medium text-[color:var(--neon)] transition-colors hover:bg-[color:var(--neon)]/15"
          >
            <LogIn className="size-3.5" />
            התחבר עם Google
          </motion.a>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-[color:#34D399]/40 bg-surface/60 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
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
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">
              {status.name ?? status.email}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {status.email}
            </div>
          </div>
        </div>
        <motion.a
          whileTap={{ scale: 0.96 }}
          href="/api/auth/signout?callbackUrl=/"
          onClick={() => tap()}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-background/40 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
        >
          <LogOut className="size-3" />
          התנתק
        </motion.a>
      </div>
    </section>
  );
}
