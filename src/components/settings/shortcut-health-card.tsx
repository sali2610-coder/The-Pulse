"use client";

// Phase 246 — Shortcut Health Card.
//
// Read-only dashboard for the iOS Shortcut → webhook pipeline.
// Shows last received event (per channel), parse outcome,
// pending count, and a "send test" button that fires a synthetic
// shortcut payload at the webhook so the user can verify wiring
// without leaving Settings.

import { useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  RefreshCw,
  Send,
  XCircle,
  Zap,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { tap } from "@/lib/haptics";

type LogEntry = {
  ts: number;
  ok: boolean;
  status: number;
  reason: string;
  externalId?: string;
  pushed?: string;
  merchant?: string;
  channel?: "sms" | "wallet" | "shortcut";
  amount?: number;
};

type LogResponse = {
  ok: boolean;
  configured?: boolean;
  mine?: LogEntry[];
  anon?: LogEntry[];
};

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const TS_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function relativeAgo(ts: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return `לפני ${sec} שניות`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `לפני ${min} דקות`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `לפני ${hr} שעות`;
  const day = Math.floor(hr / 24);
  return `לפני ${day} ימים`;
}

export function ShortcutHealthCard() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [data, setData] = useState<LogResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const entries = useFinanceStore((s) => s.entries);
  const pendingCount = entries.filter(
    (e) => e.needsConfirmation && !e.confirmedAt,
  ).length;

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/diagnostics/webhook-log", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }
      setData((await res.json()) as LogResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && !data && !loading) void refresh();
  }

  async function sendTest() {
    setTesting(true);
    try {
      const res = await fetch("/api/webhooks/transactions", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          issuer: "shortcut",
          rawText: `בדיקת קיצור · ₪1.00 · ${new Date().toISOString()}`,
          amount: 1,
          merchant: "בדיקה",
          receivedAt: Date.now(),
          appSource: "unknown",
        }),
      });
      if (res.ok) {
        toast.success("שלחנו בדיקת קיצור — בדוק את הרשימה למטה.");
        await refresh();
      } else {
        const text = await res.text();
        toast.error(`שליחה נכשלה: ${text || res.status}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  }

  const mine = data?.mine ?? [];
  const shortcutEvents = mine.filter((m) => m.channel === "shortcut");
  const lastShortcut = shortcutEvents[0];
  const lastEvent = mine[0];
  const isConnected = Boolean(lastShortcut);

  return (
    <section className="rounded-2xl border border-border/60 bg-surface/50 p-5 backdrop-blur-md">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-start"
      >
        <span className="flex items-center gap-2 text-section text-foreground">
          <Zap className="size-4 text-[color:var(--neon)]" />
          חיבור קיצור (iPhone)
        </span>
        <span className="text-caption text-muted-foreground/80">
          {open ? "סגור" : "פתח"}
        </span>
      </button>

      {open ? (
        <div className="mt-4 flex flex-col gap-3">
          {/* Status strip */}
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/8 bg-black/25 p-3">
            <StatusTile
              ok={isConnected}
              label="הקיצור מחובר"
              detail={
                isConnected
                  ? lastShortcut && relativeAgo(lastShortcut.ts)
                  : "עדיין לא התקבל אירוע"
              }
            />
            <StatusTile
              ok={pendingCount > 0 ? true : null}
              label="ממתינים לאישור"
              detail={`${pendingCount} פריטים בPendingTray`}
            />
          </div>

          {/* Test + refresh row */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={testing}
              onClick={() => {
                tap();
                void sendTest();
              }}
              className="tap-44 text-body flex flex-1 items-center justify-center gap-2 rounded-xl border border-[color:var(--neon)]/40 bg-[color:var(--neon)]/12 px-4 py-2 text-[color:var(--neon)] hover:bg-[color:var(--neon)]/20 disabled:opacity-40"
            >
              <Send className="size-4" />
              {testing ? "שולח..." : "שלח בדיקת קיצור"}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={refresh}
              aria-label="רענן"
              className="tap-44 flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-caption text-muted-foreground hover:border-white/20 hover:text-foreground disabled:opacity-40"
            >
              <RefreshCw
                className={`size-4 ${loading ? "animate-spin" : ""}`}
              />
              רענן
            </button>
          </div>

          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-caption text-destructive">
              שגיאה: {error}
            </p>
          ) : null}

          {lastEvent ? (
            <div className="flex flex-col gap-1 rounded-xl border border-white/8 bg-black/20 p-3">
              <span className="text-micro text-muted-foreground">
                האירוע האחרון
              </span>
              <span className="text-body text-foreground">
                {channelLabel(lastEvent.channel)} ·{" "}
                {lastEvent.merchant ?? "ללא שם"}
                {lastEvent.amount
                  ? ` · ${ILS.format(Math.round(lastEvent.amount))}`
                  : ""}
              </span>
              <span className="text-caption text-muted-foreground/80">
                {relativeAgo(lastEvent.ts)} ·{" "}
                {TS_FMT.format(new Date(lastEvent.ts))} ·{" "}
                {lastEvent.reason === "saved"
                  ? "נשמר"
                  : lastEvent.reason === "duplicate"
                    ? "כפילות — לא נשמר"
                    : lastEvent.reason}
                {lastEvent.pushed && lastEvent.pushed !== "skipped"
                  ? ` · push: ${lastEvent.pushed}`
                  : ""}
              </span>
            </div>
          ) : null}

          {/* History */}
          {mine.length > 0 ? (
            <ul className="flex flex-col divide-y divide-white/5 overflow-hidden rounded-xl border border-white/8 bg-black/25">
              {mine.slice(0, 8).map((m, i) => (
                <LogRow key={`${m.ts}-${i}`} entry={m} />
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-white/8 bg-black/20 p-3 text-caption text-muted-foreground">
              אין עדיין אירועים מהקיצור. השלם את שלבי החיבור והפעל
              {" "}&ldquo;שלח בדיקת קיצור&rdquo;.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function StatusTile({
  ok,
  label,
  detail,
}: {
  ok: boolean | null;
  label: string;
  detail?: string;
}) {
  const tone =
    ok === true ? "#34D399" : ok === false ? "#F87171" : "#F59E0B";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1 text-micro text-muted-foreground">
        {ok ? (
          <CheckCircle2 className="size-3" style={{ color: tone }} />
        ) : ok === false ? (
          <XCircle className="size-3" style={{ color: tone }} />
        ) : (
          <Zap className="size-3" style={{ color: tone }} />
        )}
        {label}
      </span>
      <span className="text-caption text-foreground/85" dir="rtl">
        {detail ?? "—"}
      </span>
    </div>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  const tone = entry.ok
    ? entry.reason === "duplicate"
      ? "#F59E0B"
      : "#34D399"
    : "#F87171";
  return (
    <li className="flex items-baseline justify-between gap-2 p-2.5">
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-caption text-foreground">
          {channelLabel(entry.channel)} ·{" "}
          {entry.merchant ?? "ללא שם"}
          {entry.amount
            ? ` · ${ILS.format(Math.round(entry.amount))}`
            : ""}
        </span>
        <span className="text-caption text-muted-foreground/80">
          {relativeAgo(entry.ts)} · {entry.reason}
          {entry.pushed && entry.pushed !== "skipped"
            ? ` · push: ${entry.pushed}`
            : ""}
        </span>
      </div>
      <span
        data-mono="true"
        className="text-caption font-medium"
        style={{ color: tone }}
      >
        {entry.status}
      </span>
    </li>
  );
}

function channelLabel(c?: "sms" | "wallet" | "shortcut"): string {
  if (c === "shortcut") return "קיצור";
  if (c === "wallet") return "Wallet";
  if (c === "sms") return "SMS";
  return "אירוע";
}
