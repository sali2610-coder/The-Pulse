"use client";

// Phase 267 — explicit diagnostics surface for budget persistence.
//
// Surfaces the four invariants from the brief side-by-side so the
// user (or a debugging dev) can verify what's actually persisted:
//   • local budgetMode + monthlyBudget + buffer + updatedAt
//   • cloud budgetMode + monthlyBudget + buffer (last fetched)
//   • which source the app used as authority on the latest reconcile
//
// Read-only — never writes. Lives under "מצב פיתוח" so regular
// users don't see the technical detail.

import { useState } from "react";
import { Bug, RefreshCw } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { fetchUserSettings } from "@/lib/supabase/cloud-store";
import { tap } from "@/lib/haptics";

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
  second: "2-digit",
});

type CloudResult =
  | {
      ok: true;
      monthlyBudget: number;
      budgetMode?: "manual" | "auto";
      budgetSafetyBuffer?: number;
    }
  | { ok: false; reason: string; detail?: string };

export function BudgetSettingsDiagnostics() {
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);
  const budgetMode = useFinanceStore((s) => s.budgetMode);
  const budgetSafetyBuffer = useFinanceStore((s) => s.budgetSafetyBuffer);
  const updatedAt = useFinanceStore((s) => s.budgetSettingsUpdatedAt);
  const [cloud, setCloud] = useState<CloudResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetchUserSettings();
      setCloud(r);
    } finally {
      setLoading(false);
    }
  }

  const source =
    cloud && cloud.ok
      ? cloud.budgetMode === budgetMode
        ? "in-sync"
        : cloud.budgetMode === undefined
          ? "local-only"
          : "diverged"
      : "unknown";

  return (
    <section className="rounded-2xl border border-border/40 bg-surface/30 p-5 backdrop-blur-md">
      <header className="flex items-center justify-between gap-2 pb-3">
        <span className="flex items-center gap-2 text-section text-foreground">
          <Bug className="size-4 text-muted-foreground" />
          אבחון תקציב
        </span>
        <button
          type="button"
          onClick={() => {
            tap();
            void refresh();
          }}
          disabled={loading}
          className="tap-44 flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-caption text-muted-foreground hover:border-white/20 hover:text-foreground disabled:opacity-40"
        >
          <RefreshCw
            className={`size-3.5 ${loading ? "animate-spin" : ""}`}
          />
          קרא ענן
        </button>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1 rounded-xl border border-white/10 bg-black/25 p-3">
          <span className="text-micro text-muted-foreground">מקומי</span>
          <Row label="מצב" value={budgetMode} />
          <Row
            label="תקציב חודשי"
            value={ILS.format(Math.round(monthlyBudget))}
          />
          <Row
            label="כרית ביטחון"
            value={ILS.format(Math.round(budgetSafetyBuffer))}
          />
          <Row
            label="עודכן"
            value={
              updatedAt > 0
                ? TS_FMT.format(new Date(updatedAt))
                : "לא נשמר עדיין"
            }
          />
        </div>
        <div className="flex flex-col gap-1 rounded-xl border border-white/10 bg-black/25 p-3">
          <span className="text-micro text-muted-foreground">ענן</span>
          {cloud === null ? (
            <span className="text-caption text-muted-foreground/70">
              לחץ &quot;קרא ענן&quot; כדי לקרוא את הערכים שנשמרו ב-Supabase.
            </span>
          ) : !cloud.ok ? (
            <span className="text-caption text-destructive">
              שגיאה: {cloud.reason}
              {cloud.detail ? ` · ${cloud.detail}` : ""}
            </span>
          ) : (
            <>
              <Row label="מצב" value={cloud.budgetMode ?? "—"} />
              <Row
                label="תקציב חודשי"
                value={ILS.format(Math.round(cloud.monthlyBudget))}
              />
              <Row
                label="כרית ביטחון"
                value={
                  cloud.budgetSafetyBuffer === undefined
                    ? "—"
                    : ILS.format(Math.round(cloud.budgetSafetyBuffer))
                }
              />
            </>
          )}
        </div>
      </div>

      <p className="mt-3 text-caption text-muted-foreground/85">
        מצב סנכרון: <b className="text-foreground">{source}</b>. אם הענן
        מציג &quot;—&quot; ב-mode, סכמת ה-DB ככל הנראה ישנה ולא תומכת
        בעמודה. שמירה מקומית עובדת תמיד; הענן מסונכרן בכל שינוי מצב.
      </p>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-caption text-muted-foreground/85">{label}</span>
      <span
        data-mono="true"
        dir="ltr"
        className="text-caption font-medium text-foreground"
      >
        {value}
      </span>
    </div>
  );
}
