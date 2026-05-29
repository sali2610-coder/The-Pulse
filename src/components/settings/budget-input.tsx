"use client";

// Phase 237 — single Budget Control card.
//
// Old layout shipped two competing surfaces: BudgetEditor (manual
// monthly limit) and BudgetModeToggle (radio + buffer slider). The
// user could enter a monthly limit even in Auto mode, which created
// the "two budget concepts on screen" confusion called out in the
// brief.
//
// New layout:
//   * Mode toggle at the top of the card (Manual | Auto).
//   * Manual mode → renders the monthly-limit input + live preview
//     ("This is the amount Pulse will allow you to spend this
//     month"). Save persists to `monthlyBudget`.
//   * Auto mode → hides the manual input entirely. Renders the
//     engine-derived monthly budget (read-only), the safety-buffer
//     slider with the new label, and the same live preview computed
//     against the auto result. No raw `monthlyBudget` editable.

import { useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Target } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { tap } from "@/lib/haptics";
import { BudgetPreview } from "@/components/settings/budget-preview";
import { autoBudget, effectiveMonthlyBudget } from "@/lib/auto-budget";
import type { AutoBudgetReport } from "@/lib/auto-budget";
import {
  BudgetBreakdownPanel,
  BudgetNegativeBanner,
} from "@/components/budget/budget-breakdown";
import { flushBudgetSettings } from "@/lib/budget-settings-flush";
import { toast } from "sonner";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export function BudgetInput() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);
  const setMonthlyBudget = useFinanceStore((s) => s.setMonthlyBudget);
  const mode = useFinanceStore((s) => s.budgetMode);
  const setMode = useFinanceStore((s) => s.setBudgetMode);
  const buffer = useFinanceStore((s) => s.budgetSafetyBuffer);
  const setBuffer = useFinanceStore((s) => s.setBudgetSafetyBuffer);

  // Live auto-budget calc — only mounted to render in Auto mode.
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);

  const autoReport =
    hydrated && mode === "auto"
      ? autoBudget({
          accounts,
          loans,
          incomes,
          entries,
          rules,
          statuses,
          safetyBuffer: buffer,
        })
      : null;
  const autoBudgetValue = autoReport
    ? effectiveMonthlyBudget({
        monthlyBudget,
        budgetMode: "auto",
        autoReport,
      })
    : 0;

  // Re-mount the manual editor when an external save lands so the
  // local draft re-initializes from the new persisted value without
  // a useEffect dance.
  const [formKey, setFormKey] = useState(0);

  return (
    <section className="rounded-2xl border border-border/60 bg-surface/50 p-5 backdrop-blur-md">
      <header className="mb-4 flex items-center gap-2.5">
        <Target className="size-4 text-gold" />
        <div>
          <div className="text-section text-foreground">בקרת תקציב</div>
          <div className="text-caption text-muted-foreground">
            הסכום שלפיו Pulse מחשב את ״כמה נשאר לי לבזבז״
          </div>
        </div>
      </header>

      {/* Single mode toggle. Manual = user types a cap. Auto = engine
          derives it from liquidity. Two paths never run at once. */}
      <div
        className="mb-4 flex rounded-full bg-white/8 p-1"
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
                // Phase 267 — direct cloud push, bypassing the 1.5 s
                // subscribe debounce so reinstall always restores
                // the latest mode the user picked.
                // Phase 274 — mode switches always save locally and
                // are guarded by the pending-push reconcile, so a
                // cloud RLS failure is no longer a scary red error.
                // Show a calm, dismissible note instead.
                void flushBudgetSettings().then((r) => {
                  if (!r.ok && r.reason === "rls") {
                    toast("מצב התקציב נשמר במכשיר. הסנכרון לענן ינסה שוב.", {
                      duration: 3500,
                    });
                  }
                });
              }}
              className={`text-caption flex-1 rounded-full px-4 py-2 transition-colors ${
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

      {mode === "manual" ? (
        <ManualPanel
          key={formKey}
          initialValue={monthlyBudget}
          onSave={(v) => {
            setMonthlyBudget(v);
            tap();
            setFormKey((k) => k + 1);
            void flushBudgetSettings();
          }}
        />
      ) : (
        <AutoPanel
          value={autoBudgetValue}
          report={autoReport}
          buffer={buffer}
          onBuffer={(v) => {
            setBuffer(v);
            // Buffer slider fires per-tick; relies on subscribe
            // debounce for the eventual push, but we also force a
            // flush so close-and-go doesn't drop the value.
            void flushBudgetSettings();
          }}
        />
      )}
    </section>
  );
}

function ManualPanel({
  initialValue,
  onSave,
}: {
  initialValue: number;
  onSave: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string>(
    initialValue > 0 ? String(initialValue) : "",
  );

  const parsed = Number(draft.replace(/[^\d.]/g, ""));
  const value = Number.isFinite(parsed) ? parsed : 0;
  const dirty = value !== initialValue;
  const presets = [3000, 5000, 8000, 12000];

  return (
    <div className="space-y-3">
      <p className="text-caption text-muted-foreground">
        סכום ההוצאה החודשי המקסימלי. Pulse יחסום את עצמו ביעד הזה
        ויחשב ממנו את ״כמה מותר ביום״.
      </p>

      <div className="flex items-center gap-2">
        <span
          data-mono="true"
          className="text-stat text-muted-foreground"
          style={{ direction: "ltr" }}
        >
          ₪
        </span>
        <Label htmlFor="budget-amount" className="sr-only">
          סכום תקציב
        </Label>
        <Input
          id="budget-amount"
          type="text"
          inputMode="decimal"
          dir="ltr"
          placeholder="0"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ""))}
          data-mono="true"
          className="h-14 text-stat"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            type="button"
            key={p}
            data-no-min-tap
            onClick={() => {
              tap();
              setDraft(String(p));
            }}
            className="text-caption rounded-full border border-border/60 bg-background/40 px-3 py-1.5 text-muted-foreground transition-colors hover:border-neon/50 hover:text-foreground"
          >
            {ILS.format(p)}
          </button>
        ))}
      </div>

      <motion.div
        animate={{ opacity: dirty ? 1 : 0.5 }}
        className="flex items-center justify-end pt-1"
      >
        <Button
          type="button"
          disabled={!dirty || value < 0}
          onClick={() => onSave(value)}
          className="tap-44 h-11 bg-neon text-[#050505] hover:bg-neon/90 disabled:opacity-40"
        >
          שמור
        </Button>
      </motion.div>

      <BudgetPreview draftBudget={value} />
    </div>
  );
}

function AutoPanel({
  value,
  report,
  buffer,
  onBuffer,
}: {
  value: number;
  report: AutoBudgetReport | null;
  buffer: number;
  onBuffer: (v: number) => void;
}) {
  const breakdown = report?.breakdown ?? null;
  const missingAnchors = !breakdown || !breakdown.hasAnchors;
  const available = breakdown?.available ?? 0;
  const headlineNegative = !missingAnchors && available < 0;
  const sign = (n: number) => (n < 0 ? "−" : n > 0 ? "+" : "");
  const fmt = (n: number) => `${sign(n)}${ILS.format(Math.abs(Math.round(n)))}`;

  return (
    <div className="space-y-3">
      <p className="text-caption text-muted-foreground">
        Pulse מחשב את התקציב הבטוח מנתוני הנזילות: יתרת בנק נוכחית,
        משכורות צפויות, חיובי כרטיס, הלוואות והוצאות קבועות.
      </p>

      {/* Headline */}
      <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex flex-col leading-tight">
            <span className="text-caption text-muted-foreground">
              {headlineNegative
                ? "צפוי מינוס עד המשכורת"
                : "תקציב פנוי עד המשכורת"}
            </span>
            <span className="text-caption text-muted-foreground/70">
              {missingAnchors
                ? "חסר מידע לחישוב מדויק"
                : `${report?.daysRemaining ?? 0} ימים עד למשכורת`}
            </span>
          </div>
          <span
            data-mono="true"
            dir="ltr"
            className="text-stat"
            style={{
              color: headlineNegative
                ? "#F87171"
                : missingAnchors
                  ? "rgba(255,255,255,0.55)"
                  : value > 0
                    ? "#34D399"
                    : undefined,
            }}
          >
            {missingAnchors ? "—" : fmt(available)}
          </span>
        </div>

        {headlineNegative ? (
          <div className="mt-2">
            <BudgetNegativeBanner available={available} />
          </div>
        ) : null}
      </div>

      {/* Breakdown — shared component so Home + Settings render the
         same authoritative 6-line decomposition. */}
      {breakdown ? (
        <BudgetBreakdownPanel
          breakdown={breakdown}
          trusted={!missingAnchors}
        />
      ) : null}

      {/* Phase 237 — clear labeling. Safety buffer ≠ budget. */}
      <label className="flex flex-col gap-2 rounded-2xl border border-white/8 bg-black/20 p-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-[color:var(--neon)]" />
          <span className="text-section text-foreground">כרית ביטחון</span>
        </div>
        <span className="text-caption text-muted-foreground">
          כמה כסף להשאיר בצד כדי לא להיכנס למינוס. זה לא התקציב עצמו —
          זה החיץ שיורד מהסכום שנותר.
        </span>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={5000}
            step={50}
            value={buffer}
            onChange={(e) => onBuffer(Number(e.target.value))}
            className="flex-1 accent-[color:var(--neon)]"
            aria-label="כרית ביטחון"
          />
          <span
            data-mono="true"
            dir="ltr"
            className="text-section min-w-[5ch] text-end text-foreground"
          >
            {ILS.format(buffer)}
          </span>
        </div>
      </label>

      <BudgetPreview draftBudget={value} />
    </div>
  );
}

