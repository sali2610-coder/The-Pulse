"use client";

// Phase 244 — three-step source picker for the expense form.
//
// Step 1: choose the source kind (cash / bank / card). Step 2: when
// "card" or "bank" is selected, render a real account chooser
// populated from the user's settings — never placeholder text.
// Forces every credit expense to belong to a real card and every
// bank expense to a real bank account so downstream forecasting +
// per-card aggregations stay connected.

import { Banknote, CreditCard, Wallet } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { tap } from "@/lib/haptics";

export type PaymentSource = "cash" | "bank" | "card";

const SOURCE_OPTIONS: Array<{
  id: PaymentSource;
  label: string;
  icon: typeof Banknote;
}> = [
  { id: "card", label: "אשראי", icon: CreditCard },
  { id: "bank", label: "בנק", icon: Banknote },
  { id: "cash", label: "מזומן", icon: Wallet },
];

export function SourceAccountPicker({
  source,
  accountId,
  onSource,
  onAccount,
  errorMessage,
}: {
  source: PaymentSource;
  accountId: string | undefined;
  onSource: (next: PaymentSource) => void;
  onAccount: (id: string | undefined) => void;
  errorMessage?: string;
}) {
  const accounts = useFinanceStore((s) => s.accounts);
  const cards = accounts.filter((a) => a.active && a.kind === "card");
  const banks = accounts.filter((a) => a.active && a.kind === "bank");
  const list = source === "card" ? cards : source === "bank" ? banks : [];

  return (
    <div className="flex flex-col gap-3">
      <div
        role="radiogroup"
        aria-label="מקור תשלום"
        className="grid grid-cols-3 gap-2 rounded-2xl border border-border/60 bg-surface/50 p-1.5"
      >
        {SOURCE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = source === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                if (active) return;
                tap();
                // Switching source clears the previously-chosen account so
                // the schema doesn't reject a mismatched id.
                onAccount(undefined);
                onSource(opt.id);
              }}
              className={`relative flex min-h-11 items-center justify-center gap-2 rounded-xl text-body transition-colors ${
                active
                  ? "border border-[color:var(--neon)]/40 bg-background/80 text-foreground shadow-[0_0_18px_-6px_rgba(0,229,255,0.55)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="size-4" />
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>

      {source !== "cash" ? (
        list.length === 0 ? (
          <p className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/10 p-3 text-caption text-amber-300">
            {source === "card"
              ? "אין כרטיסי אשראי פעילים. הגדרות → חשבונות → הוסף כרטיס."
              : "אין חשבונות בנק פעילים. הגדרות → חשבונות → הוסף חשבון."}
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="text-caption text-muted-foreground">
              {source === "card" ? "בחר כרטיס" : "בחר חשבון בנק"}
            </span>
            <div className="grid grid-cols-2 gap-2">
              {list.map((acc) => {
                const active = accountId === acc.id;
                const Icon = acc.kind === "card" ? CreditCard : Banknote;
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => {
                      tap();
                      onAccount(acc.id);
                    }}
                    className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-start transition-colors ${
                      active
                        ? "border-[color:var(--neon)]/60 bg-[color:var(--neon)]/10 text-foreground"
                        : "border-white/10 bg-black/25 text-muted-foreground hover:border-white/20 hover:text-foreground"
                    }`}
                    aria-pressed={active}
                  >
                    <Icon
                      className="size-4 shrink-0"
                      style={{
                        color: active ? "var(--neon)" : acc.color ?? undefined,
                      }}
                    />
                    <span className="flex min-w-0 flex-col leading-tight">
                      <span className="truncate text-body text-foreground">
                        {acc.label}
                      </span>
                      {acc.cardLast4 ? (
                        <span
                          className="text-caption text-muted-foreground"
                          dir="ltr"
                        >
                          ····{acc.cardLast4}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
            {errorMessage ? (
              <span className="text-caption text-destructive">
                {errorMessage}
              </span>
            ) : null}
          </div>
        )
      ) : null}
    </div>
  );
}
