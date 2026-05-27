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
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5 leading-tight">
          <span className="text-section text-foreground">מצב תקציב</span>
          <span className="text-caption text-muted-foreground">
            {isAuto
              ? "Pulse מחשב אוטומטית מנתוני הנזילות"
              : "תקציב ידני — הסכום שהזנת מעל"}
          </span>
        </div>
        <div
          className="flex shrink-0 rounded-full bg-white/8 p-1"
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
                data-no-min-tap
                onClick={() => {
                  tap();
                  setMode(opt.id);
                }}
                className={`text-caption rounded-full px-4 py-2 transition-colors ${
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
        <label className="flex items-center justify-between gap-2 border-t border-white/8 pt-3">
          <span className="text-caption text-muted-foreground">
            כרית בטיחות (₪) — מורידה מהסכום הבטוח
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={50}
            value={buffer}
            onChange={(e) => setBuffer(Number(e.target.value))}
            className="text-body h-10 w-24 rounded-md border border-white/12 bg-background/60 px-2 text-foreground outline-none focus:border-[color:var(--neon)]/60"
            aria-label="כרית בטיחות"
          />
        </label>
      ) : null}
    </div>
  );
}
