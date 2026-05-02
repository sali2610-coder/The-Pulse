"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Target } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { tap } from "@/lib/haptics";

const formatILS = (value: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value);

export function BudgetInput() {
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);
  const setMonthlyBudget = useFinanceStore((s) => s.setMonthlyBudget);

  // formKey re-mounts the editor when an external save happens, so the
  // local draft re-initializes from the new persisted value without an effect.
  const [formKey, setFormKey] = useState(0);

  return (
    <section className="rounded-2xl border border-border/60 bg-surface/50 p-5 backdrop-blur-md">
      <header className="mb-4 flex items-center gap-2">
        <Target className="size-4 text-gold" />
        <div>
          <div className="text-sm font-medium text-foreground">
            תקציב חודשי
          </div>
          <div className="text-[11px] text-muted-foreground">
            הקו האדום ב־Pulse לא יעבור את היעד הזה
          </div>
        </div>
      </header>

      <BudgetEditor
        key={formKey}
        initialValue={monthlyBudget}
        onSave={(value) => {
          setMonthlyBudget(value);
          tap();
          setFormKey((k) => k + 1);
        }}
      />

      <div className="mt-3 text-[11px] text-muted-foreground">
        נוכחי: {formatILS(monthlyBudget)}
      </div>
    </section>
  );
}

function BudgetEditor({
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
      <div className="flex items-center gap-2">
        <span
          data-mono="true"
          className="text-2xl text-muted-foreground"
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
          className="h-12 text-2xl"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            type="button"
            key={p}
            onClick={() => {
              tap();
              setDraft(String(p));
            }}
            className="rounded-full border border-border/60 bg-background/40 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-neon/50 hover:text-foreground"
          >
            {formatILS(p)}
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
          className="h-9 bg-neon text-[#050505] hover:bg-neon/90 disabled:opacity-40"
        >
          שמור
        </Button>
      </motion.div>
    </div>
  );
}
