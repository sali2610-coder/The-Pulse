"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Plus, Pencil, Trash2, Power } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { getCategory } from "@/lib/categories";
import { currentMonthKey } from "@/lib/dates";
import { buildStatusMap } from "@/lib/projections";
import { ruleSchedule } from "@/lib/installment-schedule";
import { tap } from "@/lib/haptics";

import { RuleForm } from "./rule-form";
import { buildRuleInstallmentSummary } from "@/lib/installment-summary";
import { InstallmentSummaryBlock } from "./installment-summary-block";
import { ErrorBoundary } from "@/components/error-boundary";

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

  type GroupKey =
    | "installments"
    | "card"
    | "bank"
    | "cash"
    | "unknown";

  const groups = useMemo(() => {
    const buckets: Record<
      GroupKey,
      { key: GroupKey; label: string; rules: typeof rules; total: number }
    > = {
      installments: { key: "installments", label: "תשלומים", rules: [], total: 0 },
      card: { key: "card", label: "כרטיס אשראי", rules: [], total: 0 },
      bank: { key: "bank", label: "חיוב בנקאי", rules: [], total: 0 },
      cash: { key: "cash", label: "מזומן", rules: [], total: 0 },
      unknown: { key: "unknown", label: "ללא קישור", rules: [], total: 0 },
    };
    for (const r of rules) {
      const key: GroupKey = r.installmentTotal
        ? "installments"
        : r.paymentSource === "card"
          ? "card"
          : r.paymentSource === "bank"
            ? "bank"
            : r.paymentSource === "cash"
              ? "cash"
              : "unknown";
      buckets[key].rules.push(r);
      // Bucket totals reflect what actually fires THIS month — a past-end
      // installment plan or a not-yet-started one is "active=true" on the
      // record but doesn't bill, so it must not inflate the group total.
      if (r.active && ruleSchedule(r, monthKey).active) {
        buckets[key].total += r.estimatedAmount;
      }
    }
    // Stable order: installments first, then by total desc.
    const ordered: (typeof buckets)[GroupKey][] = [];
    if (buckets.installments.rules.length > 0) ordered.push(buckets.installments);
    const rest = (
      ["card", "bank", "cash", "unknown"] as GroupKey[]
    )
      .map((k) => buckets[k])
      .filter((b) => b.rules.length > 0)
      .sort((a, b) => b.total - a.total);
    return [...ordered, ...rest];
  }, [rules, monthKey]);

  const [collapsed, setCollapsed] = useState<Set<GroupKey>>(new Set());
  const toggleGroup = (key: GroupKey) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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
          <div className="flex flex-col gap-3">
            {groups.map((group) => {
              const isCollapsed = collapsed.has(group.key);
              return (
                <section key={group.key} className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    className="flex items-center justify-between rounded-xl border border-white/8 bg-background/30 px-3 py-2 text-start transition-colors hover:border-white/16"
                    aria-expanded={!isCollapsed}
                  >
                    <span className="flex items-center gap-2">
                      <motion.span
                        animate={{ rotate: isCollapsed ? -90 : 0 }}
                        transition={{ duration: 0.2 }}
                        className="text-muted-foreground"
                      >
                        <ChevronDown className="size-3.5" />
                      </motion.span>
                      <span className="text-[12px] font-medium text-foreground">
                        {group.label}
                      </span>
                      <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-[9px] text-foreground/80">
                        {group.rules.length}
                      </span>
                    </span>
                    <span
                      data-mono="true"
                      dir="ltr"
                      className="text-[11px] text-muted-foreground"
                    >
                      {formatILS(group.total)}/חודש
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {!isCollapsed ? (
                      <motion.ul
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.22 }}
                        className="space-y-2 overflow-hidden"
                      >
                        {group.rules.map((rule) => {
                const cat = getCategory(rule.category);
                const Icon = cat.icon;
                const status = statusMap.get(`${rule.id}__${monthKey}`);
                const paid = status?.status === "paid";
                const sched = ruleSchedule(rule, monthKey);
                const isInstallment = Boolean(rule.installmentTotal);
                return (
                  <motion.li
                    key={rule.id}
                    layout
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    className={`rounded-2xl border p-3 ${
                      !rule.active
                        ? "border-border/40 bg-surface/30 opacity-60"
                        : sched.isComplete
                          ? "border-[#34D399]/30 bg-surface/40 opacity-75"
                          : sched.isFuture
                            ? "border-border/40 bg-surface/40 opacity-80"
                            : "border-border/60 bg-surface/60"
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
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                          <span>{cat.label}</span>
                          <span>·</span>
                          <span>ב־{rule.dayOfMonth} בחודש</span>
                          {isInstallment && sched.paymentNumber ? (
                            <>
                              <span>·</span>
                              <span data-mono="true">
                                תשלום {sched.paymentNumber}/
                                {rule.installmentTotal}
                              </span>
                              {sched.remaining !== undefined ? (
                                <>
                                  <span>·</span>
                                  <span>נותרו {sched.remaining}</span>
                                </>
                              ) : null}
                            </>
                          ) : null}
                          <span>·</span>
                          <span
                            className={
                              paid ? "text-gold" : "text-muted-foreground"
                            }
                          >
                            {paid
                              ? "שולם החודש"
                              : sched.isComplete
                                ? "הושלם"
                                : sched.isFuture
                                  ? "טרם החל"
                                  : rule.active
                                    ? "ממתין"
                                    : "כבוי"}
                          </span>
                          {rule.paymentSource && rule.paymentSource !== "unknown" ? (
                            <>
                              <span>·</span>
                              <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-[9px] text-foreground/85">
                                {rule.paymentSource === "card"
                                  ? "כרטיס"
                                  : rule.paymentSource === "bank"
                                    ? "בנק"
                                    : "מזומן"}
                              </span>
                            </>
                          ) : null}
                        </div>
                        {isInstallment && rule.installmentTotal ? (
                          (() => {
                            const summary = buildRuleInstallmentSummary(
                              rule,
                              monthKey,
                            );
                            return summary ? (
                              <InstallmentSummaryBlock
                                summary={summary}
                                accent={cat.accent}
                              />
                            ) : null;
                          })()
                        ) : null}
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
                      </motion.ul>
                    ) : null}
                  </AnimatePresence>
                </section>
              );
            })}
          </div>
        )
      ) : null}

      {mode.kind === "new" ? (
        <ErrorBoundary
          name="RuleForm:new"
          fallback={(err) => (
            <div className="space-y-2 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-[12px] text-destructive">
              <div className="font-medium">לא ניתן לטעון את הטופס.</div>
              <pre
                dir="ltr"
                style={{ whiteSpace: "pre-wrap" }}
                className="max-h-40 overflow-auto rounded-lg bg-black/40 px-2 py-1 text-[10px] text-destructive/90"
              >
                {err.message}
              </pre>
              <button
                type="button"
                onClick={() => setMode({ kind: "list" })}
                className="rounded-lg border border-destructive/40 px-3 py-1 text-[11px]"
              >
                חזרה לרשימה
              </button>
            </div>
          )}
        >
          <RuleForm
            submitLabel="הוסף"
            onCancel={() => setMode({ kind: "list" })}
            onSubmit={(values) => {
              addRule(values);
              setMode({ kind: "list" });
            }}
          />
        </ErrorBoundary>
      ) : null}

      {mode.kind === "edit"
        ? (() => {
            const rule = rules.find((r) => r.id === mode.id);
            if (!rule) {
              setMode({ kind: "list" });
              return null;
            }
            return (
              <ErrorBoundary
                name="RuleForm:edit"
                fallback={
                  <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-[12px] text-destructive">
                    לא ניתן לטעון את הטופס. חזרה לרשימה.
                    <button
                      type="button"
                      onClick={() => setMode({ kind: "list" })}
                      className="mt-2 block rounded-lg border border-destructive/40 px-3 py-1 text-[11px]"
                    >
                      חזרה לרשימה
                    </button>
                  </div>
                }
              >
                <RuleForm
                  initial={rule}
                  submitLabel="שמור שינויים"
                  onCancel={() => setMode({ kind: "list" })}
                  onSubmit={(values) => {
                    updateRule(rule.id, values);
                    setMode({ kind: "list" });
                  }}
                />
              </ErrorBoundary>
            );
          })()
        : null}
    </section>
  );
}
