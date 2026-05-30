"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  Account,
  AccountKind,
  ExpenseEntry,
  ExpenseSource,
  Income,
  Issuer,
  Loan,
  MonthKey,
  PaymentMethod,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import type { CategoryId } from "@/lib/categories";
import { findMatchingRule } from "@/lib/match";
import { findFuzzyDuplicate, findMergeTarget } from "@/lib/dedup";
import { sanitizeMerchant } from "@/lib/sanitize";
import { monthKeyOf } from "@/lib/dates";
import { captureEvent } from "@/lib/analytics";

type AddExpenseInput = {
  amount: number;
  category: CategoryId;
  note?: string;
  installments: number;
  paymentMethod: PaymentMethod;
  source?: ExpenseSource;
  chargeDate?: string;
  externalId?: string;
  issuer?: Issuer;
  cardLast4?: string;
  merchant?: string;
  accountId?: string;
  /** Bank-side pending — "תלוי ועומד" SMS or matching wallet flag. */
  bankPending?: boolean;
  /** User-side pending — Wallet partial that needs confirmation. */
  needsConfirmation?: boolean;
  /** Original Wallet notification body, retained so the confirmation sheet
   *  can offer a re-parse later. */
  rawNotificationBody?: string;
};

type AddRuleInput = {
  label: string;
  category: CategoryId;
  estimatedAmount: number;
  dayOfMonth: number;
  keywords: string[];
  installmentTotal?: number;
  startMonth?: number;
  startYear?: number;
  paymentSource?: "bank" | "card" | "cash" | "unknown";
  linkedCardId?: string;
  variable?: boolean;
};

type AddAccountInput = {
  kind: AccountKind;
  label: string;
  issuer?: Issuer;
  cardLast4?: string;
  anchorBalance?: number;
  billingDay?: number;
  paymentDay?: number;
  creditLimit?: number;
  currentDebt?: number;
  color?: string;
};

type AddLoanInput = {
  label: string;
  monthlyInstallment: number;
  /** Legacy/derived. Auto-set when start+total are present. */
  remainingBalance?: number;
  endDate?: string;
  dayOfMonth: number;
  startMonth?: number;
  startYear?: number;
  totalPayments?: number;
};

type AddIncomeInput = {
  label: string;
  amount: number;
  dayOfMonth: number;
};

type State = {
  hasHydrated: boolean;
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  monthlyBudget: number;
  /** Phase 210 — budgeting mode. "manual" keeps the existing user-typed
   *  monthlyBudget as the authority. "auto" lets the dashboard
   *  recompute the safe budget per the liquidity engine. Defaults to
   *  "manual" so legacy users see no behaviour change. */
  budgetMode: "manual" | "auto";
  /** Phase 210 — optional safety buffer subtracted from auto safe-to-
   *  spend so the user can keep a personal cushion. Default 0. */
  budgetSafetyBuffer: number;
  /** Phase 245 — epoch ms of the last LOCAL write to monthlyBudget /
   *  budgetMode / budgetSafetyBuffer. The cloud-sync reconcile uses
   *  this as a tie-breaker: when a local write happened recently
   *  (within the 5-minute window) it MUST prefer the local choice
   *  over a stale cloud row. Without this, a fast "toggle Auto →
   *  close app" sequence flipped back to Manual on reopen because
   *  the debounced cloud push didn't reach the server in time. */
  budgetSettingsUpdatedAt: number;
  /** Phase 274 — epoch ms of the last SUCCESSFUL cloud upsert of
   *  budget settings. Reconcile uses this together with
   *  budgetSettingsUpdatedAt to detect a "pending push": when local
   *  is strictly newer than cloud, the user's choice has not landed
   *  in Supabase yet (RLS failure, offline, ...) and local must win
   *  regardless of the 5-minute recency window. Defaults to 0 for
   *  legacy state. */
  budgetSettingsCloudAt: number;
  lastSyncedAt: number;
  accounts: Account[];
  loans: Loan[];
  incomes: Income[];
  /** UX preference — chime on sync. Default on. */
  audioEnabled: boolean;
  /** Phase 288 — global text-scale preference moved into the store
   *  so it persists locally AND syncs across devices via
   *  user_settings. "normal" / "compact" / "large". */
  textScale: "compact" | "normal" | "large";
  /** Phase 288 — epoch ms of the last LOCAL change. Same pending-push
   *  semantics as budgetSettingsUpdatedAt. */
  textScaleUpdatedAt: number;
  /** Phase 288 — epoch ms of the last SUCCESSFUL cloud upsert of
   *  the text-scale row. Reconcile uses this to keep local
   *  authoritative until cloud catches up. */
  textScaleCloudAt: number;
};

type Actions = {
  addExpense: (input: AddExpenseInput) => {
    entry: ExpenseEntry;
    matched?: RecurringRule;
    duplicate: boolean;
    /** True when an existing partial/pending entry was enriched in place
     *  instead of a new entry being created. The returned `entry` is the
     *  updated existing one. */
    merged?: boolean;
  };
  deleteExpense: (id: string) => void;
  /** Phase 258 — Undo for a freshly-deleted expense. Re-inserts the
   *  exact original entry (same id, same createdAt, same flags) and
   *  re-links any RecurringStatus that pointed at it. Safe to call
   *  even after the entry was already restored: dedups on id. */
  restoreExpense: (entry: ExpenseEntry) => void;
  /** Generic post-confirmation edit. Does NOT touch confirmedAt or
   *  needsConfirmation (those are owned by `confirmExpense`/`dismissPending`).
   *  Re-runs rule matching only when a field that affects matching changes
   *  (category / chargeDate / amount). If a previously-matched rule no longer
   *  fits, the link is dropped and the status reverts to pending. If a new
   *  rule fits, the link + status are upserted. */
  updateExpense: (
    id: string,
    patch: Partial<{
      amount: number;
      category: CategoryId;
      merchant: string;
      note: string;
      installments: number;
      accountId: string;
      paymentMethod: PaymentMethod;
      chargeDate: string;
      excludeFromBudget: boolean;
      isRefund: boolean;
    }>,
  ) => ExpenseEntry | undefined;
  /** Manually pin an entry to a recurring rule, or unlink (ruleId === null).
   *  Updates the `statuses` table accordingly. Used by the Edit sheet when
   *  the user wants to override automatic matching. */
  relinkExpense: (id: string, ruleId: string | null) => void;
  /** Apply user edits from the confirmation sheet, set confirmedAt, clear
   *  the needsConfirmation gate. */
  confirmExpense: (
    id: string,
    patch?: Partial<{
      amount: number;
      category: CategoryId;
      merchant: string;
      note: string;
      installments: number;
      accountId: string;
      paymentMethod: PaymentMethod;
      excludeFromBudget: boolean;
    }>,
  ) => ExpenseEntry | undefined;
  /** Drop a Wallet-pending entry the user declined ("not mine"). */
  dismissPending: (id: string) => void;

  addRule: (input: AddRuleInput) => RecurringRule;
  updateRule: (id: string, patch: Partial<AddRuleInput>) => void;
  deleteRule: (id: string) => void;
  toggleRule: (id: string) => void;
  /** Mark a recurring rule as "skipped" for a single month without
   *  disabling the rule itself. Stored as status=paid + actualAmount=0
   *  + no matchedExpenseId so every aggregation that already filters
   *  on status=paid transparently excludes it. */
  skipRecurringForMonth: (ruleId: string, monthKey: MonthKey) => void;
  /** Inverse of skipRecurringForMonth — only safe to call on a status
   *  produced by skipRecurringForMonth (matchedExpenseId === undefined). */
  unskipRecurringForMonth: (ruleId: string, monthKey: MonthKey) => void;

  addAccount: (input: AddAccountInput) => Account;
  updateAccount: (id: string, patch: Partial<AddAccountInput>) => void;
  setAnchor: (id: string, balance: number) => void;
  toggleAccount: (id: string) => void;
  deleteAccount: (id: string) => void;

  addLoan: (input: AddLoanInput) => Loan;
  updateLoan: (id: string, patch: Partial<AddLoanInput>) => void;
  toggleLoan: (id: string) => void;
  deleteLoan: (id: string) => void;

  addIncome: (input: AddIncomeInput) => Income;
  updateIncome: (id: string, patch: Partial<AddIncomeInput>) => void;
  toggleIncome: (id: string) => void;
  deleteIncome: (id: string) => void;
  /** Phase 316 — record per-month actual-received amount on an income
   *  WITHOUT touching `amount` (expected baseline). Pass `null` to clear
   *  the override for that month. */
  setIncomeActual: (id: string, monthKey: MonthKey, amount: number | null) => void;

  setMonthlyBudget: (value: number) => void;
  setBudgetMode: (mode: "manual" | "auto") => void;
  setBudgetSafetyBuffer: (value: number) => void;
  /** Phase 274 — marks the last successful cloud upsert of budget
   *  settings so reconcile can detect a still-pending push. */
  markBudgetSettingsCloudSynced: (ms: number) => void;
  /** Phase 288 — global text-scale write + cloud round-trip marker.
   *  setTextScale always bumps textScaleUpdatedAt; markTextScaleCloudSynced
   *  records the last successful cloud upsert. */
  setTextScale: (scale: "compact" | "normal" | "large") => void;
  markTextScaleCloudSynced: (ms: number) => void;
  setAudioEnabled: (v: boolean) => void;
  setLastSyncedAt: (ms: number) => void;
  setHydrated: (v: boolean) => void;
  clearAll: () => void;
};

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function clampDay(day: number): number {
  if (!Number.isFinite(day)) return 1;
  return Math.min(31, Math.max(1, Math.floor(day)));
}

function safeNumber(n: number | undefined, fallback = 0): number {
  return Number.isFinite(n) ? (n as number) : fallback;
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

/** Best-effort attach an entry to an account by (issuer, cardLast4). */
function resolveAccountId(
  accounts: Account[],
  issuer: Issuer | undefined,
  cardLast4: string | undefined,
): string | undefined {
  if (!issuer || !cardLast4) return undefined;
  const hit = accounts.find(
    (a) =>
      a.kind === "card" &&
      a.active &&
      a.issuer === issuer &&
      a.cardLast4 === cardLast4,
  );
  return hit?.id;
}

export const useFinanceStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      hasHydrated: false,
      entries: [],
      rules: [],
      statuses: [],
      monthlyBudget: 0,
      // Phase 307 — fresh-install defaults flipped to match the
      // preferences the brief calls out: budget computed by the
      // engine (Auto), 0 manual cap, large text. updatedAt stays 0
      // so cloud reconcile still treats these as defaults and a
      // saved-state row from cloud always wins.
      budgetMode: "auto",
      budgetSafetyBuffer: 0,
      budgetSettingsUpdatedAt: 0,
      budgetSettingsCloudAt: 0,
      lastSyncedAt: 0,
      accounts: [],
      loans: [],
      incomes: [],
      audioEnabled: true,
      textScale: "large",
      textScaleUpdatedAt: 0,
      textScaleCloudAt: 0,

      addExpense: (input) => {
        const cleanMerchant = input.merchant
          ? sanitizeMerchant(input.merchant)
          : undefined;
        const chargeDate = input.chargeDate ?? new Date().toISOString();
        const accountId =
          input.accountId ??
          resolveAccountId(get().accounts, input.issuer, input.cardLast4);

        // 1. Exact externalId match — handles SMS replays and CSV re-imports.
        if (input.externalId) {
          const existing = get().entries.find(
            (e) => e.externalId === input.externalId,
          );
          if (existing) {
            return { entry: existing, duplicate: true };
          }
        }

        const fuzzyCandidate = {
          amount: input.amount,
          chargeDate,
          merchant: cleanMerchant,
          cardLast4: input.cardLast4,
          accountId,
        };

        // 1.5 Merge-on-enrichment: if an existing entry is partial (needs
        //     confirmation, or missing merchant/cardLast4) and the candidate
        //     can fill in fields, update in place rather than creating a
        //     duplicate. Lets a Wallet partial graduate to a full charge
        //     when the SMS arrives shortly after.
        const mergeHit = findMergeTarget(fuzzyCandidate, get().entries);
        if (mergeHit) {
          const target = mergeHit.target;
          const fromSms = input.source === "sms";
          const filled: ExpenseEntry = {
            ...target,
            merchant: target.merchant ?? cleanMerchant,
            cardLast4: target.cardLast4 ?? input.cardLast4,
            issuer: target.issuer ?? input.issuer,
            accountId: target.accountId ?? accountId,
            note: target.note ?? input.note,
            externalId: target.externalId ?? input.externalId,
            // When the richer payload is from SMS, the row is now fully
            // identified — drop the user-confirmation gate.
            needsConfirmation: fromSms
              ? undefined
              : target.needsConfirmation,
          };
          set((state) => ({
            entries: state.entries.map((e) =>
              e.id === target.id ? filled : e,
            ),
          }));
          return { entry: filled, duplicate: false, merged: true };
        }

        // 2. Fuzzy match across sources (SMS arrived first, statement
        //    re-imports the same charge later, or vice-versa). Blocks
        //    duplicates outright.
        //
        // Phase 328 — manual entries are NEVER auto-blocked. The user
        // explicitly typed them; two ₪2 credit purchases on the same
        // card in the same day are a legitimate use case and must
        // save. Fuzzy block remains for the original cross-source
        // case (SMS replay / statement re-import), where it actually
        // prevents the duplicate it was designed for. Suspected-dup
        // detection (Phase 249) still surfaces a soft warning badge
        // on the activity list once both entries are in the store.
        const isManual = (input.source ?? "manual") === "manual";
        if (!isManual) {
          const fuzzyHit = findFuzzyDuplicate(fuzzyCandidate, get().entries);
          if (fuzzyHit) {
            return { entry: fuzzyHit, duplicate: true };
          }
        }

        const now = new Date();
        const entry: ExpenseEntry = {
          id: uid(),
          amount: input.amount,
          category: input.category,
          note: input.note,
          source: input.source ?? "manual",
          paymentMethod: input.paymentMethod,
          installments: Math.max(1, Math.floor(input.installments)),
          chargeDate,
          createdAt: now.toISOString(),
          externalId: input.externalId,
          issuer: input.issuer,
          cardLast4: input.cardLast4,
          merchant: cleanMerchant,
          accountId,
          bankPending: input.bankPending,
          needsConfirmation: input.needsConfirmation,
          rawNotificationBody: input.rawNotificationBody,
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

        try {
          captureEvent("expense_added", {
            source: finalEntry.source,
            category: finalEntry.category,
            installments: finalEntry.installments,
            paymentMethod: finalEntry.paymentMethod,
            hasMerchant: Boolean(finalEntry.merchant),
            matched: Boolean(matched),
          });
        } catch {
          /* analytics never throws into the store */
        }

        return {
          entry: finalEntry,
          matched: matched ?? undefined,
          duplicate: false,
        };
      },

      confirmExpense: (id, patch) => {
        let updated: ExpenseEntry | undefined;
        set((state) => ({
          entries: state.entries.map((e) => {
            if (e.id !== id) return e;
            const merged: ExpenseEntry = {
              ...e,
              ...(patch?.amount !== undefined && Number.isFinite(patch.amount)
                ? { amount: patch.amount }
                : {}),
              ...(patch?.category ? { category: patch.category } : {}),
              ...(patch?.merchant !== undefined
                ? { merchant: patch.merchant.trim() || undefined }
                : {}),
              ...(patch?.note !== undefined ? { note: patch.note } : {}),
              ...(patch?.installments
                ? { installments: Math.max(1, Math.floor(patch.installments)) }
                : {}),
              ...(patch?.accountId ? { accountId: patch.accountId } : {}),
              ...(patch?.paymentMethod
                ? { paymentMethod: patch.paymentMethod }
                : {}),
              ...(patch?.excludeFromBudget !== undefined
                ? { excludeFromBudget: patch.excludeFromBudget || undefined }
                : {}),
              needsConfirmation: undefined,
              confirmedAt: new Date().toISOString(),
            };
            updated = merged;
            return merged;
          }),
        }));
        return updated;
      },

      dismissPending: (id) => {
        set((state) => ({
          entries: state.entries.filter((e) => e.id !== id),
        }));
      },

      updateExpense: (id, patch) => {
        let updated: ExpenseEntry | undefined;
        set((state) => {
          const target = state.entries.find((e) => e.id === id);
          if (!target) return state;

          const cleanMerchant =
            patch.merchant !== undefined
              ? patch.merchant.trim()
                ? sanitizeMerchant(patch.merchant)
                : undefined
              : target.merchant;

          const next: ExpenseEntry = {
            ...target,
            ...(patch.amount !== undefined && Number.isFinite(patch.amount)
              ? { amount: patch.amount }
              : {}),
            ...(patch.category ? { category: patch.category } : {}),
            ...(patch.merchant !== undefined ? { merchant: cleanMerchant } : {}),
            ...(patch.note !== undefined ? { note: patch.note } : {}),
            ...(patch.installments
              ? { installments: Math.max(1, Math.floor(patch.installments)) }
              : {}),
            ...("accountId" in patch
              ? { accountId: patch.accountId || undefined }
              : {}),
            ...(patch.paymentMethod
              ? { paymentMethod: patch.paymentMethod }
              : {}),
            ...(patch.chargeDate ? { chargeDate: patch.chargeDate } : {}),
            ...(patch.excludeFromBudget !== undefined
              ? { excludeFromBudget: patch.excludeFromBudget || undefined }
              : {}),
            ...(patch.isRefund !== undefined
              ? { isRefund: patch.isRefund || undefined }
              : {}),
          };

          // Re-run matching only if a field that affects rule matching changed.
          const matchAffecting =
            patch.category !== undefined ||
            patch.chargeDate !== undefined ||
            patch.amount !== undefined;

          let nextStatuses = state.statuses;
          let finalEntry = next;

          if (matchAffecting) {
            // Drop the previous link first so re-matching is clean.
            if (target.matchedRuleId) {
              nextStatuses = nextStatuses.map((s) =>
                s.matchedExpenseId === target.id
                  ? {
                      ...s,
                      status: "pending",
                      matchedExpenseId: undefined,
                      actualAmount: undefined,
                    }
                  : s,
              );
              finalEntry = { ...finalEntry, matchedRuleId: undefined };
            }
            const reMatch = findMatchingRule({
              entry: finalEntry,
              rules: state.rules,
              statuses: nextStatuses,
            });
            if (reMatch) {
              finalEntry = { ...finalEntry, matchedRuleId: reMatch.id };
              nextStatuses = upsertStatus(nextStatuses, {
                ruleId: reMatch.id,
                monthKey: monthKeyOf(new Date(finalEntry.chargeDate)),
                status: "paid",
                matchedExpenseId: finalEntry.id,
                actualAmount: finalEntry.amount,
              });
            }
          }

          updated = finalEntry;
          return {
            entries: state.entries.map((e) =>
              e.id === id ? finalEntry : e,
            ),
            statuses: nextStatuses,
          };
        });
        return updated;
      },

      relinkExpense: (id, ruleId) => {
        set((state) => {
          const entry = state.entries.find((e) => e.id === id);
          if (!entry) return state;

          // Clear any prior link for this entry.
          let nextStatuses = state.statuses.map((s) =>
            s.matchedExpenseId === id
              ? {
                  ...s,
                  status: "pending" as const,
                  matchedExpenseId: undefined,
                  actualAmount: undefined,
                }
              : s,
          );

          if (ruleId) {
            const rule = state.rules.find((r) => r.id === ruleId);
            if (!rule) return { ...state, statuses: nextStatuses };
            nextStatuses = upsertStatus(nextStatuses, {
              ruleId: rule.id,
              monthKey: monthKeyOf(new Date(entry.chargeDate)),
              status: "paid",
              matchedExpenseId: entry.id,
              actualAmount: entry.amount,
            });
          }

          return {
            entries: state.entries.map((e) =>
              e.id === id
                ? { ...e, matchedRuleId: ruleId ?? undefined }
                : e,
            ),
            statuses: nextStatuses,
          };
        });
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

      restoreExpense: (entry) => {
        set((state) => {
          // No-op if the same id already exists (idempotent undo).
          if (state.entries.some((e) => e.id === entry.id)) return state;
          // Re-link any pending status whose matchedRuleId is set on
          // the restored entry — keeps the recurring-status table
          // consistent with the original deletion target.
          const nextStatuses = entry.matchedRuleId
            ? state.statuses.map((s) =>
                s.ruleId === entry.matchedRuleId
                  ? {
                      ...s,
                      status: "paid" as const,
                      matchedExpenseId: entry.id,
                      actualAmount: entry.amount,
                    }
                  : s,
              )
            : state.statuses;
          return {
            entries: [entry, ...state.entries],
            statuses: nextStatuses,
          };
        });
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
          installmentTotal: input.installmentTotal,
          startMonth: input.startMonth,
          startYear: input.startYear,
          paymentSource: input.paymentSource ?? "unknown",
          linkedCardId: input.linkedCardId,
          variable: input.variable,
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
                  ...("installmentTotal" in patch
                    ? { installmentTotal: patch.installmentTotal }
                    : {}),
                  ...("startMonth" in patch
                    ? { startMonth: patch.startMonth }
                    : {}),
                  ...("startYear" in patch
                    ? { startYear: patch.startYear }
                    : {}),
                  ...("paymentSource" in patch
                    ? { paymentSource: patch.paymentSource }
                    : {}),
                  ...("linkedCardId" in patch
                    ? { linkedCardId: patch.linkedCardId }
                    : {}),
                  ...("variable" in patch
                    ? { variable: patch.variable }
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

      skipRecurringForMonth: (ruleId, monthKey) => {
        set((state) => ({
          statuses: upsertStatus(state.statuses, {
            ruleId,
            monthKey,
            status: "paid",
            actualAmount: 0,
            // matchedExpenseId left undefined — the marker that
            // distinguishes "skipped" from a real matched payment.
          }),
        }));
      },

      unskipRecurringForMonth: (ruleId, monthKey) => {
        set((state) => ({
          statuses: state.statuses.filter(
            (s) =>
              !(
                s.ruleId === ruleId &&
                s.monthKey === monthKey &&
                s.status === "paid" &&
                s.actualAmount === 0 &&
                s.matchedExpenseId === undefined
              ),
          ),
        }));
      },

      addAccount: (input) => {
        const isCard = input.kind === "card";
        const clampDay = (n: number | undefined) =>
          typeof n === "number" && Number.isFinite(n) && n >= 1 && n <= 31
            ? Math.floor(n)
            : undefined;
        const acc: Account = {
          id: uid(),
          kind: input.kind,
          label: input.label.trim(),
          issuer: isCard ? input.issuer : undefined,
          cardLast4: isCard
            ? input.cardLast4?.replace(/\D/g, "").slice(-4)
            : undefined,
          anchorBalance:
            input.kind === "bank" ? safeNumber(input.anchorBalance) : undefined,
          anchorUpdatedAt:
            input.kind === "bank" && input.anchorBalance !== undefined
              ? new Date().toISOString()
              : undefined,
          billingDay: isCard ? clampDay(input.billingDay) : undefined,
          paymentDay: isCard ? clampDay(input.paymentDay) : undefined,
          creditLimit:
            isCard && typeof input.creditLimit === "number"
              ? safeNumber(input.creditLimit)
              : undefined,
          currentDebt:
            isCard && typeof input.currentDebt === "number"
              ? safeNumber(input.currentDebt)
              : undefined,
          color: isCard ? input.color : undefined,
          active: true,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ accounts: [acc, ...state.accounts] }));
        return acc;
      },

      updateAccount: (id, patch) => {
        set((state) => ({
          accounts: state.accounts.map((a) =>
            a.id === id
              ? {
                  ...a,
                  ...("label" in patch && patch.label !== undefined
                    ? { label: patch.label.trim() }
                    : {}),
                  ...("issuer" in patch ? { issuer: patch.issuer } : {}),
                  ...("cardLast4" in patch
                    ? {
                        cardLast4: patch.cardLast4
                          ?.replace(/\D/g, "")
                          .slice(-4),
                      }
                    : {}),
                  ...("anchorBalance" in patch &&
                  patch.anchorBalance !== undefined
                    ? {
                        anchorBalance: safeNumber(patch.anchorBalance),
                        anchorUpdatedAt: new Date().toISOString(),
                      }
                    : {}),
                  ...("billingDay" in patch
                    ? { billingDay: patch.billingDay }
                    : {}),
                  ...("paymentDay" in patch
                    ? { paymentDay: patch.paymentDay }
                    : {}),
                  ...("creditLimit" in patch
                    ? { creditLimit: patch.creditLimit }
                    : {}),
                  ...("currentDebt" in patch
                    ? { currentDebt: patch.currentDebt }
                    : {}),
                  ...("color" in patch ? { color: patch.color } : {}),
                }
              : a,
          ),
        }));
      },

      setAnchor: (id, balance) => {
        set((state) => ({
          accounts: state.accounts.map((a) =>
            a.id === id && a.kind === "bank"
              ? {
                  ...a,
                  anchorBalance: safeNumber(balance),
                  anchorUpdatedAt: new Date().toISOString(),
                }
              : a,
          ),
        }));
      },

      toggleAccount: (id) => {
        set((state) => ({
          accounts: state.accounts.map((a) =>
            a.id === id ? { ...a, active: !a.active } : a,
          ),
        }));
      },

      deleteAccount: (id) => {
        set((state) => ({
          accounts: state.accounts.filter((a) => a.id !== id),
          entries: state.entries.map((e) =>
            e.accountId === id ? { ...e, accountId: undefined } : e,
          ),
        }));
      },

      addLoan: (input) => {
        const monthly = safeNumber(input.monthlyInstallment);
        const total = input.totalPayments
          ? Math.max(1, Math.floor(input.totalPayments))
          : undefined;
        const loan: Loan = {
          id: uid(),
          label: input.label.trim(),
          monthlyInstallment: monthly,
          remainingBalance:
            input.remainingBalance !== undefined
              ? safeNumber(input.remainingBalance)
              : total
                ? monthly * total
                : undefined,
          endDate: input.endDate,
          dayOfMonth: clampDay(input.dayOfMonth),
          startMonth: input.startMonth,
          startYear: input.startYear,
          totalPayments: total,
          active: true,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ loans: [loan, ...state.loans] }));
        return loan;
      },

      updateLoan: (id, patch) => {
        set((state) => ({
          loans: state.loans.map((l) =>
            l.id === id
              ? {
                  ...l,
                  ...("label" in patch && patch.label !== undefined
                    ? { label: patch.label.trim() }
                    : {}),
                  ...("monthlyInstallment" in patch &&
                  patch.monthlyInstallment !== undefined
                    ? {
                        monthlyInstallment: safeNumber(
                          patch.monthlyInstallment,
                        ),
                      }
                    : {}),
                  ...("remainingBalance" in patch &&
                  patch.remainingBalance !== undefined
                    ? { remainingBalance: safeNumber(patch.remainingBalance) }
                    : {}),
                  ...("endDate" in patch && patch.endDate !== undefined
                    ? { endDate: patch.endDate }
                    : {}),
                  ...("dayOfMonth" in patch && patch.dayOfMonth !== undefined
                    ? { dayOfMonth: clampDay(patch.dayOfMonth) }
                    : {}),
                }
              : l,
          ),
        }));
      },

      toggleLoan: (id) => {
        set((state) => ({
          loans: state.loans.map((l) =>
            l.id === id ? { ...l, active: !l.active } : l,
          ),
        }));
      },

      deleteLoan: (id) => {
        set((state) => ({
          loans: state.loans.filter((l) => l.id !== id),
        }));
      },

      addIncome: (input) => {
        const income: Income = {
          id: uid(),
          label: input.label.trim(),
          amount: safeNumber(input.amount),
          dayOfMonth: clampDay(input.dayOfMonth),
          active: true,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ incomes: [income, ...state.incomes] }));
        return income;
      },

      updateIncome: (id, patch) => {
        set((state) => ({
          incomes: state.incomes.map((i) =>
            i.id === id
              ? {
                  ...i,
                  ...("label" in patch && patch.label !== undefined
                    ? { label: patch.label.trim() }
                    : {}),
                  ...("amount" in patch && patch.amount !== undefined
                    ? { amount: safeNumber(patch.amount) }
                    : {}),
                  ...("dayOfMonth" in patch && patch.dayOfMonth !== undefined
                    ? { dayOfMonth: clampDay(patch.dayOfMonth) }
                    : {}),
                }
              : i,
          ),
        }));
      },

      toggleIncome: (id) => {
        set((state) => ({
          incomes: state.incomes.map((i) =>
            i.id === id ? { ...i, active: !i.active } : i,
          ),
        }));
      },

      deleteIncome: (id) => {
        set((state) => ({
          incomes: state.incomes.filter((i) => i.id !== id),
        }));
      },

      setIncomeActual: (id, monthKey, amount) => {
        set((state) => ({
          incomes: state.incomes.map((i) => {
            if (i.id !== id) return i;
            const next = { ...(i.actualByMonth ?? {}) };
            if (amount === null || !Number.isFinite(amount) || amount <= 0) {
              delete next[monthKey];
            } else {
              next[monthKey] = safeNumber(amount);
            }
            return { ...i, actualByMonth: next };
          }),
        }));
      },

      setMonthlyBudget: (value) => {
        const safe = Number.isFinite(value) && value >= 0 ? value : 0;
        set({
          monthlyBudget: safe,
          budgetSettingsUpdatedAt: Date.now(),
        });
      },

      setBudgetMode: (mode) => {
        // Phase 274 — switching to auto clears any stale manual cap.
        // Earlier revisions left `monthlyBudget` untouched, so a
        // previously-typed 7000 lingered in localStorage, got pushed
        // back to Supabase, and resurrected the old manual value
        // after reload. Switching to manual leaves the existing
        // value alone so the user's last typed cap is restored.
        const next: "manual" | "auto" = mode === "auto" ? "auto" : "manual";
        set({
          budgetMode: next,
          ...(next === "auto" ? { monthlyBudget: 0 } : null),
          budgetSettingsUpdatedAt: Date.now(),
        });
      },

      markBudgetSettingsCloudSynced: (ms) => {
        set({ budgetSettingsCloudAt: Math.max(0, Math.floor(ms)) });
      },

      setTextScale: (scale) => {
        const next = scale === "compact" || scale === "large" ? scale : "normal";
        set({
          textScale: next,
          textScaleUpdatedAt: Date.now(),
        });
        if (typeof document !== "undefined") {
          document.documentElement.setAttribute("data-text-scale", next);
        }
      },

      markTextScaleCloudSynced: (ms) => {
        set({ textScaleCloudAt: Math.max(0, Math.floor(ms)) });
      },

      setBudgetSafetyBuffer: (value) => {
        const safe = Number.isFinite(value) && value >= 0 ? value : 0;
        set({
          budgetSafetyBuffer: safe,
          budgetSettingsUpdatedAt: Date.now(),
        });
      },

      setAudioEnabled: (v) => set({ audioEnabled: Boolean(v) }),

      setLastSyncedAt: (ms) => {
        const safe = Number.isFinite(ms) && ms >= 0 ? Math.floor(ms) : 0;
        set({ lastSyncedAt: safe });
      },

      setHydrated: (v) => set({ hasHydrated: v }),

      clearAll: () =>
        set({
          entries: [],
          rules: [],
          statuses: [],
          monthlyBudget: 0,
          lastSyncedAt: 0,
          accounts: [],
          loans: [],
          incomes: [],
        }),
    }),
    {
      name: "sally.finance",
      version: 14,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        entries: s.entries,
        rules: s.rules,
        statuses: s.statuses,
        monthlyBudget: s.monthlyBudget,
        budgetMode: s.budgetMode,
        budgetSafetyBuffer: s.budgetSafetyBuffer,
        budgetSettingsUpdatedAt: s.budgetSettingsUpdatedAt,
        budgetSettingsCloudAt: s.budgetSettingsCloudAt,
        lastSyncedAt: s.lastSyncedAt,
        accounts: s.accounts,
        loans: s.loans,
        incomes: s.incomes,
        audioEnabled: s.audioEnabled,
        textScale: s.textScale,
        textScaleUpdatedAt: s.textScaleUpdatedAt,
        textScaleCloudAt: s.textScaleCloudAt,
      }),
      migrate: (raw, fromVersion) => {
        const persisted = (raw ?? {}) as Partial<State>;
        let migrated: Partial<State> = persisted;
        if (fromVersion < 2) {
          const entries = (persisted.entries ?? []).map((e) => ({
            ...e,
            paymentMethod: e.paymentMethod ?? ("credit" as PaymentMethod),
          }));
          migrated = {
            ...migrated,
            entries,
            monthlyBudget: migrated.monthlyBudget ?? 0,
          };
        }
        if (fromVersion < 3) {
          migrated = { ...migrated, lastSyncedAt: migrated.lastSyncedAt ?? 0 };
        }
        if (fromVersion < 5) {
          migrated = {
            ...migrated,
            accounts: migrated.accounts ?? [],
            loans: migrated.loans ?? [],
            incomes: migrated.incomes ?? [],
            audioEnabled: migrated.audioEnabled ?? true,
          };
        }
        if (fromVersion < 6) {
          // Rename legacy ExpenseEntry.pending → bankPending so the new
          // `needsConfirmation` flag can carry user-side state without
          // overloading the same field.
          const entries = (migrated.entries ?? []).map((e) => {
            const legacy = e as ExpenseEntry & { pending?: boolean };
            if (legacy.pending === undefined) return e;
            const { pending, ...rest } = legacy;
            return { ...rest, bankPending: pending } as ExpenseEntry;
          });
          migrated = { ...migrated, entries };
        }
        if (fromVersion < 7) {
          // Phase 85 — recurring rules gain optional `paymentSource` +
          // `linkedCardId`. Defaults to "unknown" so every existing
          // rule keeps behaving identically; the user can refine each
          // one inline from the RecurringRulesPanel.
          const rules = (migrated.rules ?? []).map((r) => {
            const rule = r as RecurringRule;
            if (rule.paymentSource !== undefined) return rule;
            return { ...rule, paymentSource: "unknown" as const };
          });
          migrated = { ...migrated, rules };
        }
        if (fromVersion < 8) {
          // Phase 90 — Account gained optional card-tracking fields
          // (billingDay/paymentDay/creditLimit/currentDebt/color).
          // All optional → existing rows already valid at runtime;
          // this migration is a no-op guard that records the schema
          // bump so downstream debug tooling can tell v7 vs v8 state apart.
          // Existing IDs, links, balances, anchors are untouched.
          migrated = { ...migrated };
        }
        if (fromVersion < 9) {
          // Phase 193 — RecurringRule gained optional `variable` flag
          // (fixed vs variable monthly bill, drives the card-burden
          // breakdown's fixed/variable split). Undefined defaults to
          // "fixed" downstream, so this is a no-op guard.
          migrated = { ...migrated };
        }
        if (fromVersion < 10) {
          // Phase 210 — budgetMode + budgetSafetyBuffer. Default to
          // "manual" + 0 so every legacy user keeps the previous
          // typed-monthlyBudget behaviour. Opt-in only.
          migrated = {
            ...migrated,
            budgetMode: migrated.budgetMode ?? "manual",
            budgetSafetyBuffer: migrated.budgetSafetyBuffer ?? 0,
          };
        }
        if (fromVersion < 11) {
          // Phase 245 — track the last LOCAL write to budget
          // settings so cloud-sync can break ties without losing a
          // user choice. 0 means "no local opinion yet"; legitimate
          // local writes call Date.now() going forward.
          migrated = {
            ...migrated,
            budgetSettingsUpdatedAt: migrated.budgetSettingsUpdatedAt ?? 0,
          };
        }
        if (fromVersion < 12) {
          // Phase 274 — track the last SUCCESSFUL cloud upsert of
          // budget settings so reconcile can detect a pending push
          // and refuse to revert local "auto" back to cloud "manual"
          // while the upsert hasn't landed (e.g. RLS failure).
          migrated = {
            ...migrated,
            budgetSettingsCloudAt: migrated.budgetSettingsCloudAt ?? 0,
          };
        }
        if (fromVersion < 13) {
          // Phase 288 — text-scale moved off localStorage into the
          // store + cloud sync. Migrate the legacy
          // "sally.text-scale.v1" key one-shot so the user's
          // existing choice survives the bump.
          let legacy: "compact" | "normal" | "large" = "normal";
          if (typeof window !== "undefined") {
            try {
              const raw = window.localStorage.getItem("sally.text-scale.v1");
              if (raw === "compact" || raw === "large") legacy = raw;
            } catch {
              /* private mode — fall back to default */
            }
          }
          migrated = {
            ...migrated,
            textScale: migrated.textScale ?? legacy,
            textScaleUpdatedAt:
              migrated.textScaleUpdatedAt ?? (legacy !== "normal" ? Date.now() : 0),
            textScaleCloudAt: migrated.textScaleCloudAt ?? 0,
          };
        }
        if (fromVersion < 14) {
          // Phase 316 — Income gains `actualByMonth` (per-month received
          // overrides). Default to {} so the expected vs actual UI can
          // safely read it. `amount` remains the immutable baseline.
          const incomes = (migrated.incomes ?? []).map((i) => ({
            ...i,
            actualByMonth: i.actualByMonth ?? {},
          }));
          migrated = { ...migrated, incomes };
        }
        return migrated;
      },
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
