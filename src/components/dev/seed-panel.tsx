"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FlaskConical, Trash2 } from "lucide-react";
import { useFinanceStore } from "@/lib/store";
import {
  SCENARIOS,
  SCENARIO_LABELS,
  type Scenario,
} from "@/lib/mock-data";
import { tap } from "@/lib/haptics";

export function SeedPanel() {
  const [open, setOpen] = useState(false);
  const addExpense = useFinanceStore((s) => s.addExpense);
  const addRule = useFinanceStore((s) => s.addRule);
  const setMonthlyBudget = useFinanceStore((s) => s.setMonthlyBudget);
  const clearAll = useFinanceStore((s) => s.clearAll);

  const seed = (key: Scenario) => {
    const set = SCENARIOS[key];
    clearAll();
    setMonthlyBudget(set.monthlyBudget);
    for (const rule of set.rules) addRule(rule);
    for (const exp of set.expenses) addExpense(exp);
    tap();
    setOpen(false);
  };

  return (
    <div className="pointer-events-none fixed bottom-3 left-3 z-40 flex flex-col items-start gap-2">
      <AnimatePresence>
        {open ? (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-auto flex w-56 flex-col gap-1 rounded-2xl border border-border/70 bg-background/95 p-2 backdrop-blur-xl"
          >
            <div className="px-2 pb-1 pt-0.5 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              dev seed
            </div>
            {(Object.keys(SCENARIOS) as Scenario[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => seed(key)}
                className="rounded-md px-2 py-1.5 text-start text-xs text-foreground transition-colors hover:bg-surface"
              >
                {SCENARIO_LABELS[key]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                clearAll();
                tap();
                setOpen(false);
              }}
              className="mt-1 flex items-center gap-1.5 rounded-md border-t border-border/40 px-2 pt-2 text-start text-xs text-destructive/80 hover:text-destructive"
            >
              <Trash2 className="size-3" />
              נקה הכל
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Seed demo data"
        className="pointer-events-auto flex size-10 items-center justify-center rounded-full border border-border/70 bg-background/80 text-muted-foreground backdrop-blur-md transition-colors hover:border-neon/50 hover:text-foreground"
      >
        <FlaskConical className="size-4" />
      </button>
    </div>
  );
}
