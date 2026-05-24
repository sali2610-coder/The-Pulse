"use client";

// Phase 210 — auto vs manual budget mode.
//
// Drops into BudgetInput's card. Manual is the default. Auto lets
// the dashboard derive the budget from the live liquidity engine.

import { useFinanceStore } from "@/lib/store";
import { tap } from "@/lib/haptics";

export function BudgetModeToggle() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const mode = useFinanceStore((s) => s.budgetMode);
  const setMode = useFinanceStore((s) => s.setBudgetMode);
  const buffer = useFinanceStore((s) => s.budgetSafetyBuffer);
  const setBuffer = useFinanceStore((s) => s.setBudgetSafetyBuffer);

  if (!hydrated) return null;

  const isAuto = mode === "auto";

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5 leading-tight">
          <span className="text-[12px] font-medium text-foreground">
            מצב תקציב
          </span>
          <span className="text-[10.5px] text-muted-foreground">
            {isAuto
              ? "Pulse מחשב את התקציב הבטוח אוטומטית מנתוני הנזילות"
              : "תקציב ידני — הסכום שהזנת מעל"}
          </span>
        </div>
        <div
          className="flex rounded-full bg-white/8 p-0.5"
          role="radiogroup"
          aria-label="מצב תקציב"
        >
          {(
            [
              { id: "manual", label: "ידני" },
              { id: "auto", label: "אוטומטי" },
            ] as const
          ).map((opt) => {
            const active = mode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  tap();
                  setMode(opt.id);
                }}
                className={`rounded-full px-3 py-1 text-[11px] transition-colors ${
                  active
                    ? "bg-[color:var(--neon)]/30 text-[color:var(--neon)]"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {isAuto ? (
        <label className="flex items-center justify-between gap-2 border-t border-white/8 pt-2">
          <span className="text-[10.5px] text-muted-foreground">
            כרית בטיחות (₪) — מורידה מהסכום הבטוח
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={50}
            value={buffer}
            onChange={(e) => setBuffer(Number(e.target.value))}
            className="h-7 w-20 rounded-md border border-white/12 bg-background/60 px-2 text-[12px] text-foreground outline-none focus:border-[color:var(--neon)]/60"
            aria-label="כרית בטיחות"
          />
        </label>
      ) : null}
    </div>
  );
}
