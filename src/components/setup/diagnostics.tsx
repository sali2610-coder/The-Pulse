"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  RotateCw,
} from "lucide-react";
import { toast } from "sonner";
import { tap } from "@/lib/haptics";
import { forceSyncNow } from "@/lib/sync";

type LogEntry = {
  ts: number;
  ok: boolean;
  status: number;
  reason: string;
  externalId?: string;
  pushed?: string;
  merchant?: string;
};

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "ready";
      mine: LogEntry[];
      anon: LogEntry[];
      configured: boolean;
      loadedAt: number;
    }
  | { kind: "error"; message: string };

const REASON_HE: Record<string, string> = {
  saved: "נשמר ✓",
  duplicate: "כפילות (כבר קיים)",
  schema_violation: "Body שגוי — בדוק שמות שדות",
  invalid_json: "JSON לא תקין",
  unreadable_body: "לא ניתן לקרוא את ה־body",
  payload_too_large: "Body גדול מ־16KB",
  missing_personal_token: "חסר Bearer token",
  invalid_token: "Token לא תקף — צור חדש בשלב 3",
  invalid_device: "x-sally-device לא חוקי (mode legacy)",
  webhook_disabled: "WEBHOOK_SECRET לא מוגדר ב־server",
  incomplete_cal_sms: "ה־SMS לא תואם פורמט CAL — בדוק שהעתקת אותו במלואו",
  incomplete_max_sms: "ה־SMS לא תואם פורמט MAX",
  unknown_issuer: 'issuer חייב להיות "cal" או "max"',
  http_401: "401 — לא מורשה",
  http_400: "400 — Bad Request",
  http_413: "413 — Body גדול מדי",
  http_422: "422 — Schema לא תקין",
  http_503: "503 — שירות לא זמין",
};

function describeReason(reason: string): string {
  return REASON_HE[reason] ?? reason;
}

function relativeTime(ts: number, now: number): string {
  const diff = Math.max(0, now - ts);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `לפני ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `לפני ${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `לפני ${hr}h`;
  const day = Math.floor(hr / 24);
  return `לפני ${day}d`;
}

export function WebhookDiagnostics() {
  // Initial state is `loading` so the effect doesn't have to setState
  // synchronously (which the React Compiler ESLint rule rejects). All other
  // setState calls happen after an `await`, which is allowed.
  const [state, setState] = useState<State>({ kind: "loading" });
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/diagnostics/webhook-log", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "error", message: `HTTP ${res.status}` });
          return;
        }
        const data = (await res.json()) as {
          mine: LogEntry[];
          anon: LogEntry[];
          configured: boolean;
        };
        if (cancelled) return;
        setState({
          kind: "ready",
          mine: data.mine ?? [],
          anon: data.anon ?? [],
          configured: data.configured,
          loadedAt: Date.now(),
        });
      } catch {
        if (!cancelled) setState({ kind: "error", message: "network" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  const now = state.kind === "ready" ? state.loadedAt : 0;

  return (
    <section
      className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent p-5 backdrop-blur-md"
      style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" }}
    >
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-neon" />
          <div>
            <div className="text-sm font-medium text-foreground">
              אבחון Webhook
            </div>
            <div className="text-[11px] text-muted-foreground">
              20 הקריאות האחרונות שלך + 10 כשלי-אימות גלובליים
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <SyncNowButton />
          <button
            type="button"
            onClick={() => {
              tap();
              setState({ kind: "loading" });
              setRefreshTick((n) => n + 1);
            }}
            disabled={state.kind === "loading"}
            aria-label="רענן לוג"
            className="flex size-8 items-center justify-center rounded-lg border border-border/60 bg-background/40 text-muted-foreground transition-colors hover:border-neon/50 hover:text-foreground disabled:opacity-40"
          >
            <RefreshCw
              className={`size-3.5 ${state.kind === "loading" ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </header>

      {state.kind === "error" ? (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 text-[11px] text-destructive">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <span>טעינת הלוג נכשלה: {state.message}</span>
        </div>
      ) : null}

      {state.kind === "ready" && !state.configured ? (
        <p className="text-[11px] text-muted-foreground">
          KV לא מוגדר. הרץ <code className="font-mono">scripts/setup.sh</code>.
        </p>
      ) : null}

      {state.kind === "ready" && state.configured ? (
        <div className="space-y-4">
          <Section
            title="הקריאות שלך"
            entries={state.mine}
            now={now}
            empty="עוד אף קריאה לא נרשמה תחת המשתמש שלך. שלח SMS-בדיקה דרך ה־Shortcut או הרץ את כפתור 'בדוק חיבור' למעלה."
          />
          {state.anon.length > 0 ? (
            <Section
              title="כשלי אימות אחרונים (גלובלי)"
              entries={state.anon}
              now={now}
              empty=""
              dimmed
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SyncNowButton() {
  const [busy, setBusy] = useState(false);
  const onSync = async () => {
    if (busy) return;
    tap();
    setBusy(true);
    try {
      const { ok, added } = await forceSyncNow();
      if (!ok) {
        toast.error("סנכרון נכשל");
        return;
      }
      if (added === 0) {
        toast.message("מעודכן — אין עסקאות חדשות");
      } else {
        toast.success(`נוספו ${added} עסקאות`);
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={onSync}
      disabled={busy}
      aria-label="סנכרן עכשיו"
      className="flex h-8 items-center gap-1.5 rounded-lg border border-neon/30 bg-neon/10 px-2.5 text-[11px] text-foreground transition-colors hover:border-neon/60 disabled:opacity-40"
    >
      <RotateCw className={`size-3 ${busy ? "animate-spin" : ""}`} />
      סנכרן
    </button>
  );
}

function Section({
  title,
  entries,
  now,
  empty,
  dimmed,
}: {
  title: string;
  entries: LogEntry[];
  now: number;
  empty: string;
  dimmed?: boolean;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {title}
      </div>
      {entries.length === 0 ? (
        <p
          className={`rounded-xl border border-dashed border-border/40 px-3 py-3 text-[11px] ${
            dimmed ? "text-muted-foreground/60" : "text-muted-foreground"
          }`}
        >
          {empty}
        </p>
      ) : (
        <ul className="space-y-1.5">
          <AnimatePresence initial={false}>
            {entries.map((e) => (
              <motion.li
                key={`${e.ts}-${e.reason}`}
                layout
                initial={{ opacity: 0, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`flex items-start gap-2 rounded-xl border px-3 py-2 ${
                  e.ok
                    ? "border-[#34D399]/20 bg-[#34D399]/5"
                    : "border-destructive/20 bg-destructive/5"
                } ${dimmed ? "opacity-70" : ""}`}
              >
                {e.ok ? (
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[#34D399]" />
                ) : (
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2 text-[12px]">
                    <span className="truncate font-medium text-foreground">
                      {describeReason(e.reason)}
                    </span>
                    <span
                      data-mono="true"
                      className="shrink-0 text-[10px] text-muted-foreground"
                      style={{ direction: "ltr" }}
                    >
                      {e.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <Clock className="size-3" />
                    <span>{relativeTime(e.ts, now)}</span>
                    {e.merchant ? (
                      <>
                        <span>·</span>
                        <span className="truncate">{e.merchant}</span>
                      </>
                    ) : null}
                    {e.pushed ? (
                      <>
                        <span>·</span>
                        <span>push: {e.pushed}</span>
                      </>
                    ) : null}
                  </div>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
