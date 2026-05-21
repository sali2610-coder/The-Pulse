"use client";

import { useEffect } from "react";

import { useFinanceStore } from "@/lib/store";
import { enqueueMutation } from "@/lib/mutation-queue";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
} from "@/types/finance";

// Bridges Zustand store mutations to the Phase 138 offline queue
// WITHOUT touching a single store action. Diffs the persisted slice
// between consecutive store updates and enqueues kind-specific
// mutations for anything that was added or changed. Deletes land as
// soft-deletes via the `_deleted: true` payload flag so server-side
// idempotent upserts can tombstone the row.
//
// Design constraints:
//   - Zero store / schema / financial-engine changes.
//   - Dormant when Supabase isn't configured — saves the diff cost.
//   - Runs only on client mount; SSR is unaffected.
//   - Cheap O(n) diff using id maps so larger entry lists don't drag.
//   - Initial snapshot captures the post-hydration state; we
//     deliberately DO NOT enqueue everything on first mount because
//     the eventual server-side sync handshake (Phase A continuation)
//     will perform a full upsert via cloud backup payloads.

type Identifiable = { id: string };

function diffById<T extends Identifiable>(
  next: readonly T[],
  prev: readonly T[],
): { added: T[]; updated: T[]; removedIds: string[] } {
  const prevMap = new Map(prev.map((p) => [p.id, p] as const));
  const added: T[] = [];
  const updated: T[] = [];
  for (const n of next) {
    const before = prevMap.get(n.id);
    if (!before) {
      added.push(n);
      continue;
    }
    if (!shallowEqual(before, n)) updated.push(n);
    prevMap.delete(n.id);
  }
  const removedIds = Array.from(prevMap.keys());
  return { added, updated, removedIds };
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    a == null ||
    b == null ||
    typeof a !== "object" ||
    typeof b !== "object"
  ) {
    return false;
  }
  const ak = Object.keys(a as Record<string, unknown>);
  const bk = Object.keys(b as Record<string, unknown>);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (
      (a as Record<string, unknown>)[k] !==
      (b as Record<string, unknown>)[k]
    ) {
      return false;
    }
  }
  return true;
}

function enqueueAdded<T extends Identifiable>(
  kind: string,
  list: T[],
): void {
  for (const item of list) enqueueMutation({ kind, payload: item });
}

function enqueueRemoved(kind: string, ids: string[]): void {
  for (const id of ids) {
    enqueueMutation({ kind, payload: { id, _deleted: true } });
  }
}

type Snapshot = {
  entries: readonly ExpenseEntry[];
  accounts: readonly Account[];
  rules: readonly RecurringRule[];
  loans: readonly Loan[];
  incomes: readonly Income[];
};

function takeSnapshot(): Snapshot {
  const s = useFinanceStore.getState();
  return {
    entries: s.entries,
    accounts: s.accounts,
    rules: s.rules,
    loans: s.loans,
    incomes: s.incomes,
  };
}

/** Mount once at AppShell level. Dormant when Supabase isn't
 *  configured. */
export function useStoreMutationBridge(): void {
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let lastSnapshot = takeSnapshot();
    const unsubscribe = useFinanceStore.subscribe((state) => {
      const next: Snapshot = {
        entries: state.entries,
        accounts: state.accounts,
        rules: state.rules,
        loans: state.loans,
        incomes: state.incomes,
      };

      if (next.entries !== lastSnapshot.entries) {
        const d = diffById(next.entries, lastSnapshot.entries);
        enqueueAdded("expense.add", d.added);
        enqueueAdded("expense.update", d.updated);
        enqueueRemoved("expense.update", d.removedIds);
      }
      if (next.accounts !== lastSnapshot.accounts) {
        const d = diffById(next.accounts, lastSnapshot.accounts);
        enqueueAdded("account.upsert", [...d.added, ...d.updated]);
        enqueueRemoved("account.upsert", d.removedIds);
      }
      if (next.rules !== lastSnapshot.rules) {
        const d = diffById(next.rules, lastSnapshot.rules);
        enqueueAdded("rule.upsert", [...d.added, ...d.updated]);
        enqueueRemoved("rule.upsert", d.removedIds);
      }
      if (next.loans !== lastSnapshot.loans) {
        const d = diffById(next.loans, lastSnapshot.loans);
        enqueueAdded("loan.upsert", [...d.added, ...d.updated]);
        enqueueRemoved("loan.upsert", d.removedIds);
      }
      if (next.incomes !== lastSnapshot.incomes) {
        const d = diffById(next.incomes, lastSnapshot.incomes);
        enqueueAdded("income.upsert", [...d.added, ...d.updated]);
        enqueueRemoved("income.upsert", d.removedIds);
      }

      lastSnapshot = next;
    });
    return () => unsubscribe();
  }, []);
}

// Exposed for tests.
export const _internal = { diffById, shallowEqual };
