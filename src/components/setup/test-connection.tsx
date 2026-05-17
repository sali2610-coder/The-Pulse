"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertCircle, Loader2, PlugZap } from "lucide-react";
import { tap, success as successHaptic } from "@/lib/haptics";

type ZodIssue = { field: string; message: string; code: string };

type Result =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; externalId: string }
  | { kind: "fail"; reason: string; issues?: ZodIssue[] };

const SAMPLE_SMS = String.raw`לקוח יקר, בוצעה עסקה בכרטיסך המסתיימת ב-1234 בבית עסק 'בדיקת חיבור Sally' בסכום 1.00 ש"ח בתאריך 05/05/26.`;

type Props = {
  webhookUrl: string;
  deviceId: string;
};

/** Sends a synthetic CAL-style SMS through the production webhook with the
 *  user's actual device id (no Bearer needed). Returns a friendly Hebrew
 *  status: ✅ עובד / ❌ + explanation. Drives the recovery flow when the
 *  Shortcut isn't reaching us. */
export function TestConnection({ webhookUrl, deviceId }: Props) {
  const [result, setResult] = useState<Result>({ kind: "idle" });

  const run = async () => {
    if (!deviceId) {
      setResult({ kind: "fail", reason: "missing_device_id" });
      return;
    }
    tap();
    setResult({ kind: "running" });
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-sally-device": deviceId,
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
      successHaptic();
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
        disabled={result.kind === "running" || !deviceId}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-neon/40 bg-gradient-to-b from-neon/15 to-transparent px-4 py-3.5 text-sm font-medium text-foreground transition-all hover:border-neon/70 disabled:opacity-40"
      >
        {result.kind === "running" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <PlugZap className="size-4 text-neon" />
        )}
        בדוק חיבור עכשיו
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
                <div className="font-medium text-[#34D399]">
                  ✅ החיבור עובד
                </div>
                <div className="text-muted-foreground">
                  עסקת בדיקה (1 ₪ ב־&quot;בדיקת חיבור Sally&quot;) נכתבה
                  בהצלחה. תופיע בדאשבורד תוך כדקה. אפשר למחוק אותה ידנית
                  כשלא צריך אותה.
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
                <div className="font-medium text-destructive">
                  ❌ החיבור נכשל
                </div>
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
  if (reason === "missing_device_id") {
    return (
      <p className="text-muted-foreground">
        ה־deviceId לא קיים — אתחל את המכשיר בהגדרות → אינטגרציה.
      </p>
    );
  }
  if (reason === "invalid_device") {
    return (
      <p className="text-muted-foreground">
        ה־header{" "}
        <code className="font-mono">x-sally-device</code> ריק או לא חוקי.
        ודא שב־Shortcut כתבת אותו במדויק כפי שמופיע כאן.
      </p>
    );
  }
  if (reason === "kv_not_configured") {
    return (
      <p className="text-muted-foreground">
        ה־Vercel KV לא מותקן בסביבת השרת. ההגדרה צריכה להיעשות ב־Vercel
        Marketplace.
      </p>
    );
  }
  if (reason === "network_error" || reason.startsWith("HTTP 5")) {
    return (
      <p className="text-muted-foreground">
        השרת לא ענה. נסה שוב בעוד דקה.
      </p>
    );
  }
  return null;
}
