"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Pencil, Trash2, Power } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { getCategory } from "@/lib/categories";
import { currentMonthKey } from "@/lib/dates";
import { buildStatusMap } from "@/lib/projections";
import { tap } from "@/lib/haptics";

import { RuleForm } from "./rule-form";

const formatILS = (value: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value);

export function RecurringRulesPanel() {
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const addRule = useFinanceStore((s) => s.addRule);
  const updateRule = useFinanceStore((s) => s.updateRule);
  const deleteRule = useFinanceStore((s) => s.deleteRule);
  const toggleRule = useFinanceStore((s) => s.toggleRule);

  const [mode, setMode] = useState<
    { kind: "list" } | { kind: "new" } | { kind: "edit"; id: string }
  >({ kind: "list" });

  const monthKey = currentMonthKey();
  const statusMap = useMemo(() => buildStatusMap(statuses), [statuses]);

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-foreground">
            הוצאות קבועות
          </div>
          <div className="text-[11px] text-muted-foreground">
            המערכת תשדך אליהן עסקאות אוטומטית כשיגיעו
          </div>
        </div>
        {mode.kind === "list" ? (
          <button
            type="button"
            onClick={() => {
              tap();
              setMode({ kind: "new" });
            }}
            className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-neon/50 hover:text-foreground"
          >
            <Plus className="size-3.5 text-neon" />
            חדשה
          </button>
        ) : null}
      </header>

      {mode.kind === "list" ? (
        rules.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/50 px-4 py-8 text-center text-xs text-muted-foreground">
            אין עדיין הוצאות קבועות. הוסף את הראשונה כדי שהמערכת תוכל לשדך אוטומטית חיובים נכנסים.
          </p>
        ) : (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {rules.map((rule) => {
                const cat = getCategory(rule.category);
                const Icon = cat.icon;
                const status = statusMap.get(`${rule.id}__${monthKey}`);
                const paid = status?.status === "paid";
                return (
                  <motion.li
                    key={rule.id}
                    layout
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    className={`rounded-2xl border p-3 ${
                      rule.active
                        ? "border-border/60 bg-surface/60"
                        : "border-border/40 bg-surface/30 opacity-60"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/60"
                        style={{ color: cat.accent }}
                      >
                        <Icon className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-foreground">
                            {rule.label}
                          </span>
                          <span
                            data-mono="true"
                            className="text-sm text-foreground"
                            style={{ direction: "ltr" }}
                          >
                            {formatILS(rule.estimatedAmount)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span>{cat.label}</span>
                          <span>·</span>
                          <span>ב־{rule.dayOfMonth} בחודש</span>
                          <span>·</span>
                          <span
                            className={
                              paid ? "text-gold" : "text-muted-foreground"
                            }
                          >
                            {paid
                              ? "שולם החודש"
                              : rule.active
                                ? "ממתין"
                                : "כבוי"}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setMode({ kind: "edit", id: rule.id })
                            }
                            className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-surface hover:text-foreground"
                          >
                            <Pencil className="size-3" />
                            עריכה
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleRule(rule.id)}
                            className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-surface hover:text-foreground"
                          >
                            <Power className="size-3" />
                            {rule.active ? "כבה" : "הפעל"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`למחוק את "${rule.label}"?`)) {
                                deleteRule(rule.id);
                              }
                            }}
                            className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-destructive/80 hover:bg-destructive/10"
                          >
                            <Trash2 className="size-3" />
                            מחק
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )
      ) : null}

      {mode.kind === "new" ? (
        <RuleForm
          submitLabel="הוסף"
          onCancel={() => setMode({ kind: "list" })}
          onSubmit={(values) => {
            addRule(values);
            setMode({ kind: "list" });
          }}
        />
      ) : null}

      {mode.kind === "edit"
        ? (() => {
            const rule = rules.find((r) => r.id === mode.id);
            if (!rule) {
              setMode({ kind: "list" });
              return null;
            }
            return (
              <RuleForm
                initial={rule}
                submitLabel="שמור שינויים"
                onCancel={() => setMode({ kind: "list" })}
                onSubmit={(values) => {
                  updateRule(rule.id, values);
                  setMode({ kind: "list" });
                }}
              />
            );
          })()
        : null}
    </section>
  );
}
