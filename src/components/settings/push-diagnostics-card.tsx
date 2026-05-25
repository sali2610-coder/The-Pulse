"use client";

// Phase 222 — push diagnostics dashboard.
//
// Hits /api/push/diag and renders the recent push attempt log with
// per-row status, reason, endpoint host, and external id. Existed
// implicitly via recordPushAttempt (Phase 62) but until now there was
// no UI to inspect it — so when a push silently failed, the user (or
// future-me) had no visibility into why.
//
// Read-only. Reuses the existing /api/push/diag endpoint extended in
// Phase 222 to return `attempts[]` (last 20).

import { useState } from "react";
import { Activity, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";

type PushAttempt = {
  ts: number;
  ok: boolean;
  gone: boolean;
  status?: number;
  reason?: string;
  endpointHost?: string;
  externalId?: string;
};

type DiagPayload = {
  ok: boolean;
  vapidConfigured?: boolean;
  kvConfigured?: boolean;
  apnsConfigured?: boolean;
  fcmConfigured?: boolean;
  subscription?: { endpointHost?: string; registeredAt?: number } | null;
  lastAttempt?: PushAttempt | null;
  attempts?: PushAttempt[];
};

const TS_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function PushDiagnosticsCard() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DiagPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/push/diag", {
        cache: "no-store",
        credentials: "include",
      });
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        setData(null);
        return;
      }
      const json = (await res.json()) as DiagPayload;
      if (!json.ok) {
        setError("הסקופ לא זוהה — התחבר ונסה שוב.");
        setData(null);
        return;
      }
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleToggle() {
    const next = !open;
    setOpen(next);
    // Lazy-load on first open. Subsequent opens reuse the cached data;
    // the refresh button does an explicit re-fetch.
    if (next && !data && !loading) void refresh();
  }

  return (
    <section className="rounded-2xl border border-border/60 bg-surface/50 p-5 backdrop-blur-md">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-start"
      >
        <span className="flex items-center gap-2 text-[12px] uppercase tracking-[0.22em] text-muted-foreground">
          <Activity className="size-3 text-[color:var(--neon)]" />
          אבחון Push
        </span>
        <span className="text-[10px] text-muted-foreground/70">
          {open ? "סגור" : "פתח"}
        </span>
      </button>

      {open ? (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground/85">
              20 ניסיונות Push האחרונים — הצלחות, כשלים, יעד.
            </p>
            <button
              type="button"
              disabled={loading}
              onClick={refresh}
              aria-label="רענן"
              className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-muted-foreground hover:border-white/20 hover:text-foreground disabled:opacity-40"
            >
              <RefreshCw
                className={`size-3 ${loading ? "animate-spin" : ""}`}
              />
              רענן
            </button>
          </div>

          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
              שגיאה: {error}
            </p>
          ) : null}

          {data ? <ConfigGrid data={data} /> : null}

          {data?.attempts && data.attempts.length > 0 ? (
            <ul className="flex flex-col divide-y divide-white/5 overflow-hidden rounded-xl border border-white/8 bg-black/25">
              {data.attempts.map((a, i) => (
                <AttemptRow key={`${a.ts}-${i}`} attempt={a} />
              ))}
            </ul>
          ) : data ? (
            <p className="rounded-lg border border-white/8 bg-black/20 p-3 text-[11px] text-muted-foreground">
              אין ניסיונות Push להציג. שלח התראת בדיקה כדי לאכלס את היומן.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ConfigGrid({ data }: { data: DiagPayload }) {
  const items: Array<{ label: string; ok: boolean; detail?: string }> = [
    { label: "VAPID", ok: !!data.vapidConfigured },
    { label: "KV", ok: !!data.kvConfigured },
    { label: "APNs", ok: !!data.apnsConfigured },
    { label: "FCM", ok: !!data.fcmConfigured },
    {
      label: "Subscription",
      ok: !!data.subscription,
      detail: data.subscription?.endpointHost,
    },
  ];
  return (
    <ul className="grid grid-cols-2 gap-2 rounded-xl border border-white/8 bg-black/25 p-3 text-[11px] sm:grid-cols-5">
      {items.map((it) => (
        <li
          key={it.label}
          className="flex flex-col gap-0.5 leading-tight"
          title={it.detail}
        >
          <span className="flex items-center gap-1 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
            {it.ok ? (
              <CheckCircle2 className="size-3 text-[#34D399]" />
            ) : (
              <AlertCircle className="size-3 text-[#F87171]" />
            )}
            {it.label}
          </span>
          <span className="truncate text-[11px] text-foreground" dir="ltr">
            {it.detail ?? (it.ok ? "מוגדר" : "לא מוגדר")}
          </span>
        </li>
      ))}
    </ul>
  );
}

function AttemptRow({ attempt }: { attempt: PushAttempt }) {
  const tone = attempt.ok
    ? "#34D399"
    : attempt.gone
      ? "#F59E0B"
      : "#F87171";
  const label = attempt.ok
    ? "OK"
    : attempt.gone
      ? "GONE"
      : attempt.status
        ? `HTTP ${attempt.status}`
        : "FAIL";
  return (
    <li className="flex items-start gap-2 p-2.5">
      <span
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-[9px] font-semibold"
        style={{ background: `${tone}22`, color: tone }}
        aria-label={label}
      >
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-[11px] text-foreground" dir="ltr">
          {attempt.externalId ?? "—"}
        </span>
        <span className="text-[10px] text-muted-foreground" dir="ltr">
          {TS_FMT.format(new Date(attempt.ts))}
          {attempt.endpointHost ? ` · ${attempt.endpointHost}` : ""}
        </span>
        {attempt.reason ? (
          <span className="truncate text-[10px] text-muted-foreground/80">
            {attempt.reason}
          </span>
        ) : null}
      </div>
    </li>
  );
}
