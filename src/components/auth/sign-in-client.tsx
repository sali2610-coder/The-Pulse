"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { LogIn, ShieldAlert } from "lucide-react";

// Mounts the actual Google sign-in form. Fetches a fresh CSRF token from
// /api/auth/csrf, then submits as an HTML form to /api/auth/signin/google.
// Using a form POST (rather than `signIn("google")` from next-auth/react)
// keeps the runtime cost low — no NextAuth client bundle pulled into the
// shell.

const ERR_HEBREW: Record<string, string> = {
  OAuthSignin: "Google דחה את ההתחברות. נסה שוב.",
  OAuthCallback: "כשל בחזרה מ-Google. נסה שוב.",
  OAuthCreateAccount: "לא ניתן ליצור חשבון חדש.",
  EmailCreateAccount: "לא ניתן ליצור חשבון.",
  Callback: "שגיאה בשלב ה-callback.",
  OAuthAccountNotLinked:
    "החשבון הזה כבר מקושר לספק התחברות אחר.",
  EmailSignin: "כשל בשליחת לינק התחברות.",
  SessionRequired: "נדרשת התחברות כדי להמשיך.",
  Default: "כשל בהתחברות. נסה שוב.",
};

export function SignInClient({
  authEnabled,
  callbackUrl,
  initialError,
}: {
  authEnabled: boolean;
  callbackUrl: string;
  initialError?: string;
}) {
  const [csrf, setCsrf] = useState<string | null>(null);

  useEffect(() => {
    if (!authEnabled) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/csrf", { cache: "no-store" });
        const json = (await res.json()) as { csrfToken?: string };
        if (!cancelled && typeof json.csrfToken === "string") {
          setCsrf(json.csrfToken);
        }
      } catch {
        /* network failure — button will fall back to GET redirect */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authEnabled]);

  if (!authEnabled) {
    return (
      <div className="flex flex-col gap-4 text-right text-sm">
        <div className="flex items-start gap-3 rounded-2xl border border-gold/30 bg-gold/8 p-3">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-gold" />
          <p className="text-[12px] leading-relaxed text-foreground/85">
            Google OAuth לא מופעל בדפלוימנט הזה. אפשר להמשיך בלי חשבון —
            הנתונים נשמרים תחת מזהה המכשיר.
          </p>
        </div>
        <Link
          href="/"
          className="btn-confirm flex h-12 w-full items-center justify-center rounded-2xl text-sm font-semibold transition-transform active:scale-[0.99]"
        >
          המשך אל הדאשבורד
        </Link>
      </div>
    );
  }

  const errorMessage = initialError
    ? ERR_HEBREW[initialError] ?? ERR_HEBREW.Default
    : null;

  return (
    <div className="flex flex-col gap-3 text-right text-sm">
      {errorMessage ? (
        <div
          role="alert"
          className="rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-[12px] text-destructive"
        >
          {errorMessage}
        </div>
      ) : null}

      <form action="/api/auth/signin/google" method="POST">
        {csrf ? (
          <input type="hidden" name="csrfToken" value={csrf} />
        ) : null}
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <motion.button
          type="submit"
          whileTap={{ scale: 0.98 }}
          disabled={!csrf}
          className="btn-confirm flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition-transform active:scale-[0.99] disabled:opacity-60"
        >
          <LogIn className="size-4" />
          התחבר עם Google
        </motion.button>
      </form>

      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        ההתחברות פותחת חלון Google שדורש הסכמה לקריאת שם + תמונת פרופיל +
        כתובת מייל. שום נתון פיננסי לא נשלח אל Google.
      </p>

      <Link
        href="/"
        className="mt-1 text-center text-[11px] text-muted-foreground underline-offset-2 hover:underline"
      >
        המשך בלי להתחבר
      </Link>
    </div>
  );
}
