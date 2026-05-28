"use client";

// Phase 258 — single-call "delete with undo" for entry rows.
//
// Pattern reused by CardsHierarchyCard + CategorySpendCard so both
// surfaces behave identically: snapshot the entry → call
// deleteExpense → show a sonner toast with a 5s Undo action that
// calls restoreExpense. Every recalculation (card totals, category
// totals, future balance, liquidity curve) happens automatically
// because the store-derived memos already react to entries[].

import { toast } from "sonner";

import { useFinanceStore } from "@/lib/store";
import { tap } from "@/lib/haptics";

const UNDO_WINDOW_MS = 5_000;

export function useDeleteWithUndo() {
  const deleteExpense = useFinanceStore((s) => s.deleteExpense);
  const restoreExpense = useFinanceStore((s) => s.restoreExpense);
  const entries = useFinanceStore((s) => s.entries);

  return function deleteWithUndo(id: string) {
    const snapshot = entries.find((e) => e.id === id);
    if (!snapshot) return;
    deleteExpense(id);
    tap();
    const label = snapshot.merchant || snapshot.note || "ההוצאה";
    toast(`נמחקה — ${label}`, {
      description: "אם זו טעות, אפשר לבטל בתוך 5 שניות.",
      duration: UNDO_WINDOW_MS,
      action: {
        label: "ביטול",
        onClick: () => {
          restoreExpense(snapshot);
          tap();
          toast.success("שוחזרה");
        },
      },
    });
  };
}
