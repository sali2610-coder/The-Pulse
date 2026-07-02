"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  CloudUpload,
  Loader2,
  Lock,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { tap } from "@/lib/haptics";
import { signInWithGoogle } from "@/lib/supabase/auth";

// Premium fintech welcome screen. Rendered server-side when auth is enabled
// and the user has no active session. Replaces the previous "stub /sign-in
// page" model — root visiting an unauthenticated user lands them here, on
// the page they actually opened, with no flash of dashboard content.

const TRUST_BULLETS: Array<{ icon: typeof Lock; label: string; copy: string }> =
  [
    {
      icon: CloudUpload,
      label: "מסתנכרן",
      copy: "הנתונים נשמרים בענן ומסתנכרנים בין המכשירים.",
    },
    {
      icon: Lock,
      label: "פרטי",
      copy: "החיבור דרך Google. שום נתון פיננסי לא יוצא לצד שלישי.",
    },
    {
      icon: Activity,
      label: "בזמן אמת",
      copy: "חיובי אפל פיי, SMS, וייבוא דפי כרטיס — נכנסים לדאשבורד אוטומטית.",
    },
  ];

export function WelcomeScreen({ next }: { next?: string }) {
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleSignIn = async () => {
    tap();
    setBusy(true);
    setAuthError(null);
    const result = await signInWithGoogle(
      typeof window !== "undefined"
        ? `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(
            next ?? "/",
          )}`
        : undefined,
    );
    if (!result.ok) {
      setAuthError(result.reason);
      setBusy(false);
    }
    // On ok=true the browser is already redirecting to Google.
  };

  return (
    <main
      dir="rtl"
      className="relative flex min-h-[100dvh] flex-col items-stretch px-5"
      style={{
        paddingTop: "max(env(safe-area-inset-top), 2.5rem)",
        paddingBottom: "max(env(safe-area-inset-bottom), 2rem)",
      }}
    >
      {/* Ambient aurora — gold + neon */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="animate-aurora absolute -top-40 -end-20 size-[420px] rounded-full bg-gold/14 blur-[120px]" />
        <div className="animate-aurora absolute -bottom-48 -start-32 size-[480px] rounded-full bg-[color:var(--neon)]/12 blur-[140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(120%_60%_at_50%_0%,rgba(255,255,255,0.04),transparent_60%)]" />
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-stretch justify-between gap-8 py-6">
        {/* HERO */}
        <motion.section
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="flex flex-col gap-3 text-right"
        >
          <div className="flex items-center justify-start gap-2 text-[11px] uppercase tracking-[0.34em] text-gold/85">
            <Sparkles className="size-3.5" strokeWidth={1.7} />
            The Pulse · Sally
          </div>

          <h1 className="text-4xl font-extralight leading-[1.05] tracking-tight text-foreground sm:text-5xl">
            <span className="text-foreground">תקציב חי. </span>
            <span className="bg-gradient-to-l from-gold via-foreground to-[color:var(--neon)] bg-clip-text text-transparent">
              דופק פיננסי אמיתי.
            </span>
          </h1>

          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground sm:text-base">
            כל חיוב, כל הוצאה קבועה, וכל יתרה — במקום אחד. The Pulse בונה לך
            תמונת מצב חיה של החודש, מסתנכרן בין המכשירים, ומתריע לפני שזה
            הופך לבעיה.
          </p>
        </motion.section>

        {/* PULSE ANIMATION — minimal hero visual */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15, duration: 0.6 }}
          className="relative mx-auto flex h-32 w-full max-w-xs items-center justify-center"
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              animate={{ scale: [1, 1.18, 1], opacity: [0.55, 0, 0.55] }}
              transition={{
                duration: 2.4,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="size-32 rounded-full bg-[color:var(--neon)]/25 blur-2xl"
            />
          </div>
          <div className="relative flex size-20 items-center justify-center rounded-full border border-white/15 bg-surface/60 backdrop-blur-xl">
            <TrendingUp
              className="size-8 text-gold"
              strokeWidth={1.4}
            />
          </div>
        </motion.div>

        {/* TRUST */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5 }}
          className="grid grid-cols-3 gap-2"
        >
          {TRUST_BULLETS.map(({ icon: Icon, label, copy }) => (
            <div
              key={label}
              className="glass-card flex flex-col gap-2 rounded-2xl p-3 text-right"
            >
              <span className="flex size-7 items-center justify-center rounded-lg bg-white/6 text-[color:var(--neon)]">
                <Icon className="size-3.5" strokeWidth={1.8} />
              </span>
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {label}
              </div>
              <p className="text-[11px] leading-snug text-foreground/85">
                {copy}
              </p>
            </div>
          ))}
        </motion.section>

        {/* CTA */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.5 }}
          className="flex flex-col gap-3"
        >
          <motion.button
            type="button"
            whileTap={{ scale: 0.985 }}
            whileHover={{ y: -1 }}
            onClick={handleSignIn}
            disabled={busy}
            className="relative flex h-14 w-full items-center justify-center gap-3 overflow-hidden rounded-2xl border border-white/12 bg-gradient-to-b from-white to-white/95 text-[15px] font-semibold text-[#0A0A0A] shadow-[0_18px_45px_-22px_rgba(255,255,255,0.55)] transition-transform disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <GoogleMark />
            )}
            התחבר עם Google
          </motion.button>

          {authError ? (
            <p className="text-center text-[11px] text-destructive" dir="ltr">
              שגיאה: {authError}
            </p>
          ) : null}

          <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
            בלחיצה אתה מאשר חיבור לחשבון Google ומסכים שנשמור שם, מייל ותמונת
            פרופיל בלבד.
          </p>

        </motion.section>
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 48 48"
      aria-hidden
    >
      <path
        fill="#FFC107"
        d="M43.61 20.08H42V20H24v8h11.3c-1.65 4.66-6.08 8-11.3 8a12 12 0 1 1 0-24c3.06 0 5.85 1.15 7.96 3.04L37.62 9.4A20 20 0 1 0 24 44a20 20 0 0 0 19.61-23.92Z"
      />
      <path
        fill="#FF3D00"
        d="m6.31 14.69 6.57 4.82A12 12 0 0 1 24 12c3.06 0 5.85 1.15 7.96 3.04L37.62 9.4A20 20 0 0 0 6.31 14.69Z"
      />
      <path
        fill="#4CAF50"
        d="M24 44a20 20 0 0 0 13.46-5.21l-6.21-5.25A11.96 11.96 0 0 1 24 36c-5.2 0-9.6-3.32-11.27-7.95l-6.52 5.02A20 20 0 0 0 24 44Z"
      />
      <path
        fill="#1976D2"
        d="M43.61 20.08H42V20H24v8h11.3a12.05 12.05 0 0 1-4.04 5.54l.01-.01 6.21 5.25C36.96 39.4 44 34 44 24c0-1.34-.14-2.65-.39-3.92Z"
      />
    </svg>
  );
}
