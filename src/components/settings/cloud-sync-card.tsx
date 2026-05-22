"use client";

// Cloud-truth status surface.
//
// Three distinct states render different bodies:
//
//   1. Supabase not configured (env vars absent) →
//        single-row notice. KV device-scoped flow is the only source
//        of truth until env vars are wired up.
//
//   2. Configured but no Supabase session →
//        "Connect Google" CTA that fires Supabase OAuth. Tells the
//        user this is the path to multi-device sync.
//
//   3. Configured AND signed in →
//        Counts: cloud vs local. Last sync time. RLS health.
//        Status badge (מסונכרן / מסנכרן / שגיאה).

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { useFinanceStore } from "@/lib/store";
import { useCloudSyncState } from "@/lib/supabase/cloud-sync-context";
import { signInWithGoogle, signOut } from "@/lib/supabase/auth";
import { tap } from "@/lib/haptics";

const TIME_FMT = new Intl.DateTimeFormat("he-IL", {
  dateStyle: undefined,
  timeStyle: "medium",
});

function fmt(ts: number | null): string {
  if (!ts) return "—";
  try {
    return TIME_FMT.format(new Date(ts));
  } catch {
    return "—";
  }
}

export function CloudSyncCard() {
  const state = useCloudSyncState();
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const [busy, setBusy] = useState(false);

  const localCounts = useMemo(
    () => ({
      entries: entries.length,
      rules: rules.length,
      accounts: accounts.length,
      loans: loans.length,
      incomes: incomes.length,
    }),
    [entries.length, rules.length, accounts.length, loans.length, incomes.length],
  );

  if (!hydrated) return null;
  if (!state) return null;

  // 1. Not configured.
  if (!state.configured) {
    return (
      <section className="rounded-3xl border border-white/8 bg-surface/60 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/5 text-muted-foreground">
            <CloudOff className="size-5" />
          </span>
          <div>
            <div className="text-sm font-medium text-foreground">
              סנכרון ענן — לא מוגדר
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              הוסף את משתני הסביבה <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> ו־<code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> ב־Vercel
              כדי להפעיל סנכרון רב־מכשירי תחת RLS.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // 2. Configured but no Supabase session.
  if (!state.authenticated) {
    return (
      <section className="rounded-3xl border border-[color:var(--neon)]/30 bg-surface/60 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[color:var(--neon)]/15 text-[color:var(--neon)]">
            <Cloud className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-foreground">
              חבר את הנתונים לענן
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              התחברות עם Google תעלה את הנתונים שלך לענן מוגן ב־RLS.
              ניתן להיכנס מכל מכשיר ולראות את אותם הנתונים.
            </p>
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              disabled={busy}
              onClick={async () => {
                tap();
                setBusy(true);
                try {
                  const r = await signInWithGoogle();
                  if (!r.ok) {
                    toast.error(`לא ניתן להתחבר: ${r.reason}`);
                  }
                } finally {
                  setBusy(false);
                }
              }}
              className="mt-3 flex items-center gap-1.5 rounded-full border border-[color:var(--neon)]/40 bg-[color:var(--neon)]/10 px-4 py-2 text-xs font-medium text-[color:var(--neon)] disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Cloud className="size-3.5" />
              )}
              חבר את Google לסנכרון ענן
            </motion.button>
          </div>
        </div>
      </section>
    );
  }

  // 3. Configured + authenticated.
  const cloud = state.cloudCounts ?? {
    entries: 0,
    rules: 0,
    accounts: 0,
    loans: 0,
    incomes: 0,
  };
  const inSync =
    cloud.entries === localCounts.entries &&
    cloud.rules === localCounts.rules &&
    cloud.accounts === localCounts.accounts &&
    cloud.loans === localCounts.loans &&
    cloud.incomes === localCounts.incomes;

  const tone = state.hydrating
    ? "#FCD34D"
    : state.lastError
      ? "#F87171"
      : inSync && state.hydrated
        ? "#34D399"
        : "#FCD34D";
  const label = state.hydrating
    ? "מסנכרן"
    : state.lastError
      ? "שגיאה"
      : inSync && state.hydrated
        ? "מסונכרן"
        : "ממתין";

  return (
    <section className="rounded-3xl border border-[color:#34D399]/40 bg-surface/60 p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-2xl"
            style={{ background: `${tone}22`, color: tone }}
          >
            {state.hydrating ? (
              <Loader2 className="size-5 animate-spin" />
            ) : state.lastError ? (
              <AlertTriangle className="size-5" />
            ) : (
              <CheckCircle2 className="size-5" />
            )}
          </span>
          <div className="text-sm font-medium text-foreground">
            סנכרון ענן
            <span
              className="ms-2 rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: `${tone}22`, color: tone }}
            >
              {label}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            tap();
            setBusy(true);
            try {
              await signOut();
              toast.success("הסנכרון נותק");
            } finally {
              setBusy(false);
            }
          }}
          className="flex items-center gap-1 rounded-full border border-white/10 bg-background/40 px-3 py-1.5 text-[10px] text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="size-3" />
          נתק
        </button>
      </header>

      <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1 text-[10.5px] text-muted-foreground">
        <Dt label="משתמש ענן">
          {state.cloudUserId ? state.cloudUserId.slice(0, 8) + "…" : "—"}
        </Dt>
        <Dt label="עדכון אחרון">{fmt(state.lastSyncAt)}</Dt>
        <Dt label="חיובים (ענן/מקומי)">
          {cloud.entries} / {localCounts.entries}
        </Dt>
        <Dt label="חשבונות (ענן/מקומי)">
          {cloud.accounts} / {localCounts.accounts}
        </Dt>
        <Dt label="קבועים (ענן/מקומי)">
          {cloud.rules} / {localCounts.rules}
        </Dt>
        <Dt label="הלוואות + הכנסות">
          {cloud.loans + cloud.incomes} / {localCounts.loans + localCounts.incomes}
        </Dt>
        <Dt label="RLS">{state.rlsOk === true ? "תקין" : state.rlsOk === false ? "נכשל" : "—"}</Dt>
        <Dt label="שגיאה אחרונה">{state.lastError ?? "—"}</Dt>
      </dl>
    </section>
  );
}

function Dt({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0 leading-tight">
      <dt className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground/70">
        {label}
      </dt>
      <dd className="text-[11px] text-foreground" dir="ltr" data-mono="true">
        {children}
      </dd>
    </div>
  );
}
