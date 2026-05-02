"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  ExpenseEntry,
  ExpenseSource,
  PaymentMethod,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import type { CategoryId } from "@/lib/categories";
import { findMatchingRule } from "@/lib/match";
import { monthKeyOf } from "@/lib/dates";

type AddExpenseInput = {
  amount: number;
  category: CategoryId;
  note?: string;
  installments: number;
  paymentMethod: PaymentMethod;
  source?: ExpenseSource;
  chargeDate?: string;
};

type AddRuleInput = {
  label: string;
  category: CategoryId;
  estimatedAmount: number;
  dayOfMonth: number;
  keywords: string[];
};

type State = {
  hasHydrated: boolean;
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  monthlyBudget: number;
};

type Actions = {
  addExpense: (input: AddExpenseInput) => {
    entry: ExpenseEntry;
    matched?: RecurringRule;
  };
  deleteExpense: (id: string) => void;
  addRule: (input: AddRuleInput) => RecurringRule;
  updateRule: (id: string, patch: Partial<AddRuleInput>) => void;
  deleteRule: (id: string) => void;
  toggleRule: (id: string) => void;
  setMonthlyBudget: (value: number) => void;
  setHydrated: (v: boolean) => void;
  clearAll: () => void;
};

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const useFinanceStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      hasHydrated: false,
      entries: [],
      rules: [],
      statuses: [],
      monthlyBudget: 0,

      addExpense: (input) => {
        const now = new Date();
        const entry: ExpenseEntry = {
          id: uid(),
          amount: input.amount,
          category: input.category,
          note: input.note,
          source: input.source ?? "manual",
          paymentMethod: input.paymentMethod,
          installments: Math.max(1, Math.floor(input.installments)),
          chargeDate: input.chargeDate ?? now.toISOString(),
          createdAt: now.toISOString(),
        };

        const matched = findMatchingRule({
          entry,
          rules: get().rules,
          statuses: get().statuses,
        });

        const finalEntry = matched
          ? { ...entry, matchedRuleId: matched.id }
          : entry;

        set((state) => {
          const nextStatuses = matched
            ? upsertStatus(state.statuses, {
                ruleId: matched.id,
                monthKey: monthKeyOf(new Date(finalEntry.chargeDate)),
                status: "paid",
                matchedExpenseId: finalEntry.id,
                actualAmount: finalEntry.amount,
              })
            : state.statuses;
          return {
            entries: [finalEntry, ...state.entries],
            statuses: nextStatuses,
          };
        });

        return { entry: finalEntry, matched: matched ?? undefined };
      },

      deleteExpense: (id) => {
        set((state) => ({
          entries: state.entries.filter((e) => e.id !== id),
          statuses: state.statuses.map((s) =>
            s.matchedExpenseId === id
              ? {
                  ...s,
                  status: "pending",
                  matchedExpenseId: undefined,
                  actualAmount: undefined,
                }
              : s,
          ),
        }));
      },

      addRule: (input) => {
        const rule: RecurringRule = {
          id: uid(),
          label: input.label.trim(),
          category: input.category,
          estimatedAmount: input.estimatedAmount,
          dayOfMonth: clampDay(input.dayOfMonth),
          keywords: input.keywords
            .map((k) => k.trim())
            .filter((k) => k.length > 0),
          active: true,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ rules: [rule, ...state.rules] }));
        return rule;
      },

      updateRule: (id, patch) => {
        set((state) => ({
          rules: state.rules.map((r) =>
            r.id === id
              ? {
                  ...r,
                  ...("label" in patch && patch.label !== undefined
                    ? { label: patch.label.trim() }
                    : {}),
                  ...("category" in patch && patch.category !== undefined
                    ? { category: patch.category }
                    : {}),
                  ...("estimatedAmount" in patch &&
                  patch.estimatedAmount !== undefined
                    ? { estimatedAmount: patch.estimatedAmount }
                    : {}),
                  ...("dayOfMonth" in patch && patch.dayOfMonth !== undefined
                    ? { dayOfMonth: clampDay(patch.dayOfMonth) }
                    : {}),
                  ...("keywords" in patch && patch.keywords !== undefined
                    ? {
                        keywords: patch.keywords
                          .map((k) => k.trim())
                          .filter((k) => k.length > 0),
                      }
                    : {}),
                }
              : r,
          ),
        }));
      },

      deleteRule: (id) => {
        set((state) => ({
          rules: state.rules.filter((r) => r.id !== id),
          statuses: state.statuses.filter((s) => s.ruleId !== id),
          entries: state.entries.map((e) =>
            e.matchedRuleId === id ? { ...e, matchedRuleId: undefined } : e,
          ),
        }));
      },

      toggleRule: (id) => {
        set((state) => ({
          rules: state.rules.map((r) =>
            r.id === id ? { ...r, active: !r.active } : r,
          ),
        }));
      },

      setMonthlyBudget: (value) => {
        const safe = Number.isFinite(value) && value >= 0 ? value : 0;
        set({ monthlyBudget: safe });
      },

      setHydrated: (v) => set({ hasHydrated: v }),

      clearAll: () =>
        set({ entries: [], rules: [], statuses: [], monthlyBudget: 0 }),
    }),
    {
      name: "sally.finance",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        entries: s.entries,
        rules: s.rules,
        statuses: s.statuses,
        monthlyBudget: s.monthlyBudget,
      }),
      migrate: (raw, fromVersion) => {
        const persisted = (raw ?? {}) as Partial<State>;
        if (fromVersion < 2) {
          const entries = (persisted.entries ?? []).map((e) => ({
            ...e,
            paymentMethod: e.paymentMethod ?? ("credit" as PaymentMethod),
          }));
          return {
            ...persisted,
            entries,
            monthlyBudget: persisted.monthlyBudget ?? 0,
          };
        }
        return persisted;
      },
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);

function clampDay(day: number): number {
  if (!Number.isFinite(day)) return 1;
  return Math.min(31, Math.max(1, Math.floor(day)));
}

function upsertStatus(
  list: RecurringStatus[],
  next: RecurringStatus,
): RecurringStatus[] {
  const idx = list.findIndex(
    (s) => s.ruleId === next.ruleId && s.monthKey === next.monthKey,
  );
  if (idx === -1) return [...list, next];
  const copy = list.slice();
  copy[idx] = next;
  return copy;
}
