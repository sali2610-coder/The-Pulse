"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertCircle, Loader2, PlugZap } from "lucide-react";
import { tap } from "@/lib/haptics";

type ZodIssue = { field: string; message: string; code: string };

type Result =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; externalId: string }
  | { kind: "fail"; reason: string; issues?: ZodIssue[] };

const SAMPLE_SMS = String.raw`לקוח יקר, בוצעה עסקה בכרטיסך המסתיימת ב-1234 בבית עסק 'בדיקת חיבור Sally' בסכום 1.00 ש"ח בתאריך 05/05/26.`;

type Props = {
  webhookUrl: string;
  token: string | null;
};

/**
 * Round-trips a sample SMS through the user's own webhook with their token.
 * If everything is wired correctly the response is ok+persisted, and the
 * test transaction shows up in the dashboard within ~60s on the next sync.
 */
export function TestConnection({ webhookUrl, token }: Props) {
  const [result, setResult] = useState<Result>({ kind: "idle" });

  const run = async () => {
    if (!token) {
      setResult({ kind: "fail", reason: "צור טוקן בשלב 3 לפני הבדיקה" });
      return;
    }
    tap();
    setResult({ kind: "running" });
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ issuer: "cal", smsBody: SAMPLE_SMS }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        issues?: ZodIssue[];
        persisted?: boolean;
        duplicate?: boolean;
        externalId?: string;
      } | null;
      if (!res.ok || !json?.ok) {
        setResult({
          kind: "fail",
          reason: json?.error ?? `HTTP ${res.status}`,
          issues: json?.issues,
        });
        return;
      }
      if (!json.persisted) {
        setResult({ kind: "fail", reason: "kv_not_configured" });
        return;
      }
      setResult({ kind: "ok", externalId: json.externalId ?? "" });
    } catch (err) {
      setResult({
        kind: "fail",
        reason: err instanceof Error ? err.message : "network_error",
      });
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={run}
        disabled={result.kind === "running" || !token}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-neon/40 bg-gradient-to-b from-neon/15 to-transparent px-4 py-3 text-sm font-medium text-foreground transition-all hover:border-neon/70 disabled:opacity-40"
      >
        {result.kind === "running" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <PlugZap className="size-4 text-neon" />
        )}
        בדוק חיבור
      </button>

      <AnimatePresence mode="wait">
        {result.kind === "ok" ? (
          <motion.div
            key="ok"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-[#34D399]/40 bg-[#34D399]/10 p-3 text-[12px] text-foreground/90"
          >
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#34D399]" />
              <div className="space-y-1">
                <div className="font-medium">החיבור עובד.</div>
                <div className="text-muted-foreground">
                  עסקת בדיקה (1 ₪, &quot;בדיקת חיבור Sally&quot;) נכתבה ל־KV
                  שלך. תופיע בדאשבורד אוטומטית תוך כדקה. אפשר למחוק אותה
                  ידנית.
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}

        {result.kind === "fail" ? (
          <motion.div
            key="fail"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-[12px] text-foreground/90"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div className="space-y-1">
                <div className="font-medium">החיבור נכשל</div>
                <div className="text-muted-foreground">
                  סיבה:{" "}
                  <code className="font-mono text-foreground/80">
                    {result.reason}
                  </code>
                </div>
                {result.issues && result.issues.length > 0 ? (
                  <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                    {result.issues.map((iss, i) => (
                      <li key={i}>
                        <code className="font-mono text-foreground/80">
                          {iss.field}
                        </code>{" "}
                        — {iss.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <FailHint reason={result.reason} />
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function FailHint({ reason }: { reason: string }) {
  if (reason === "invalid_token" || reason === "missing_personal_token") {
    return (
      <p className="text-muted-foreground">
        ה־Bearer token לא תואם. חזור לשלב 3, צור טוקן חדש, ועדכן את ה־Shortcut.
      </p>
    );
  }
  if (reason === "kv_not_configured") {
    return (
      <p className="text-muted-foreground">
        Vercel KV (Upstash) לא מותקן בסביבת השרת. הרץ{" "}
        <code className="font-mono">scripts/setup.sh</code> או הוסף ידנית מה־
        Vercel Marketplace.
      </p>
    );
  }
  if (reason === "webhook_disabled") {
    return (
      <p className="text-muted-foreground">
        האתר רץ במצב single-user ללא Personal Tokens. ב־Vercel envs קבע{" "}
        <code className="font-mono">NEXT_PUBLIC_AUTH_ENABLED=true</code>.
      </p>
    );
  }
  return null;
}
