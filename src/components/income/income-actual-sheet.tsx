"use client";

// Income · per-month 'received in actual' editor.
//
// Opens from the Home 'מזומן' action menu → 'הכנסה'. Presents every
// active income for the current calendar month as an editable row:
//
//   expected: baseline income.amount
//   actual  : editable ₪ input, defaults to whatever is currently
//             resolved for the month (respects existing override)
//   percent : Math.round(actual / expected * 100)
//   delta   : actual − expected, signed
//
// Save writes each changed row through store.setIncomeActual —
// the SAME existing per-month override mechanism the forecast,
// liquidity curve, EOM projection, and Time-tab checkpoints already
// consume. Nothing new in the engine; UI only.
//
// One-off semantics: overrides ARE per monthKey. Next month reverts
// to the baseline unless the user explicitly edits it again — same
// contract the store already documents.

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useFinanceStore } from "@/lib/store";
import { addMonths, currentMonthKey } from "@/lib/dates";
import { incomeForMonth } from "@/lib/income-month";
import {
  tap as hapticTap,
  success as hapticSuccess,
} from "@/lib/haptics";
import type { Income } from "@/types/finance";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const MONTH_FMT = new Intl.DateTimeFormat("he-IL", {
  month: "long",
  year: "numeric",
});

type Draft = {
  actual: string;
  overrideExists: boolean;
};

export function IncomeActualSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  // Re-key the inner form each time the sheet opens so state resets
  // without needing setState-in-effect. `key` in JSX triggers a fresh
  // mount of the inner component with fresh useState defaults.
  const [openCount, setOpenCount] = useState(0);
  function handleOpenChange(next: boolean) {
    if (next) setOpenCount((c) => c + 1);
    onOpenChange(next);
  }
  return (
    <BottomSheet
      open={open}
      onOpenChange={handleOpenChange}
      title="עדכון הכנסה בפועל"
      className="ia-sheet"
    >
      <IncomeActualBody
        key={openCount}
        onClose={() => onOpenChange(false)}
      />
    </BottomSheet>
  );
}

function IncomeActualBody({ onClose }: { onClose: () => void }) {
  const incomes = useFinanceStore((s) => s.incomes);
  const setIncomeActual = useFinanceStore((s) => s.setIncomeActual);

  const monthKey = currentMonthKey();
  const nextKey = addMonths(monthKey, 1);
  const active = useMemo<Income[]>(
    () =>
      incomes
        .filter((i) => i.active)
        .slice()
        .sort((a, b) => a.dayOfMonth - b.dayOfMonth),
    [incomes],
  );

  // Seed drafts once at mount from the currently resolved value per
  // income for this month.
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    const seed: Record<string, Draft> = {};
    for (const i of active) {
      seed[i.id] = {
        actual: String(Math.round(incomeForMonth(i, monthKey))),
        overrideExists: i.actualByMonth?.[monthKey] !== undefined,
      };
    }
    return seed;
  });
  const [saving, setSaving] = useState(false);

  function updateDraft(id: string, actual: string) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], actual },
    }));
  }
  function clearOverride(id: string) {
    hapticTap();
    setIncomeActual(id, monthKey, null);
    const inc = active.find((i) => i.id === id);
    if (inc) {
      setDrafts((prev) => ({
        ...prev,
        [id]: {
          actual: String(Math.round(inc.amount)),
          overrideExists: false,
        },
      }));
    }
    toast.success("השינוי החד-פעמי בוטל · חזר לבסיס");
  }

  async function commit() {
    if (saving) return;
    setSaving(true);
    let changes = 0;
    for (const inc of active) {
      const d = drafts[inc.id];
      if (!d) continue;
      const parsed = Number((d.actual || "").replace(/[^\d.-]/g, ""));
      if (!Number.isFinite(parsed) || parsed < 0) continue;
      const resolvedNow = incomeForMonth(inc, monthKey);
      if (Math.abs(parsed - resolvedNow) < 0.5) continue;
      setIncomeActual(
        inc.id,
        monthKey,
        parsed === inc.amount ? null : parsed,
      );
      changes += 1;
    }
    hapticSuccess();
    if (changes === 0) {
      toast.info("אין שינוי לשמור");
    } else {
      toast.success(
        `נשמרו ${changes} עדכונים · חודש הבא חוזר לבסיס אלא אם ישונה שוב`,
      );
    }
    setSaving(false);
    onClose();
  }

  // Aggregate metrics for the sheet header
  const totalExpected = active.reduce((s, i) => s + i.amount, 0);
  const totalActual = active.reduce((s, i) => {
    const raw = drafts[i.id]?.actual;
    if (raw === undefined) return s + incomeForMonth(i, monthKey);
    const parsed = Number((raw || "").replace(/[^\d.-]/g, ""));
    return s + (Number.isFinite(parsed) ? parsed : incomeForMonth(i, monthKey));
  }, 0);
  const totalPct =
    totalExpected > 0 ? Math.round((totalActual / totalExpected) * 100) : 0;
  const totalDelta = totalActual - totalExpected;

  const monthDate = mkParts(monthKey);
  const monthLabel = MONTH_FMT.format(
    new Date(monthDate[0], monthDate[1] - 1, 1),
  );

  return (
    <>
      <div className="ia-body" dir="rtl">
        <header className="ia-header">
          <div className="ia-header-text">
            <span className="ia-eyebrow">בפועל · {monthLabel}</span>
            <span className="ia-title">כמה נכנס באמת החודש?</span>
          </div>
          <div className="ia-header-totals">
            <span className="ia-total-value" data-mono="true" dir="ltr">
              {ILS.format(Math.round(totalActual))}
            </span>
            <span className="ia-total-baseline" data-mono="true" dir="ltr">
              מתוך {ILS.format(Math.round(totalExpected))} · {totalPct}%
            </span>
            <span
              className="ia-total-delta"
              data-mono="true"
              dir="ltr"
              data-tone={totalDelta >= 0 ? "safe" : "danger"}
            >
              {totalDelta >= 0 ? "+" : "−"}
              {ILS.format(Math.round(Math.abs(totalDelta)))}
            </span>
          </div>
        </header>

        <p className="ia-note">
          שינויים חלים על החודש הנוכחי בלבד. חודש הבא ({nextKey}) חוזר לבסיס
          אלא אם ישונה שוב ידנית.
        </p>

        {active.length === 0 ? (
          <div className="ia-empty">אין הכנסות פעילות. הגדר משכורת בפרופיל.</div>
        ) : (
          <ul className="ia-list">
            <AnimatePresence initial={false}>
              {active.map((inc) => {
                const draft = drafts[inc.id];
                const expected = inc.amount;
                const parsed =
                  draft && draft.actual !== ""
                    ? Number(draft.actual.replace(/[^\d.-]/g, ""))
                    : incomeForMonth(inc, monthKey);
                const actual = Number.isFinite(parsed) ? parsed : 0;
                const pct =
                  expected > 0 ? Math.round((actual / expected) * 100) : 0;
                const delta = actual - expected;
                const tone: "safe" | "watch" | "danger" =
                  delta >= 0
                    ? "safe"
                    : delta > -Math.abs(expected * 0.03)
                      ? "watch"
                      : "danger";
                return (
                  <motion.li
                    key={inc.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.28 }}
                    className="ia-row"
                    data-tone={tone}
                  >
                    <div className="ia-row-head">
                      <div className="ia-row-titles">
                        <span className="ia-row-name">{inc.label}</span>
                        <span className="ia-row-meta">
                          צפוי {ILS.format(Math.round(expected))} · יום{" "}
                          {inc.dayOfMonth}
                        </span>
                      </div>
                      {draft?.overrideExists ? (
                        <button
                          type="button"
                          className="ia-row-clear"
                          onClick={() => clearOverride(inc.id)}
                          aria-label={`בטל שינוי חד-פעמי לחודש הזה עבור ${inc.label}`}
                        >
                          בטל שינוי
                        </button>
                      ) : null}
                    </div>
                    <label className="ia-row-field">
                      <span className="ia-row-field-label">
                        בפועל התקבל (₪)
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="ia-row-input"
                        value={draft?.actual ?? ""}
                        onChange={(e) => updateDraft(inc.id, e.target.value)}
                        dir="ltr"
                        data-mono="true"
                        aria-label={`הכנסה שהתקבלה בפועל עבור ${inc.label}`}
                      />
                    </label>
                    <div className="ia-row-metrics">
                      <span className="ia-row-metric" data-tone={tone}>
                        {pct}% מהצפוי
                      </span>
                      <span
                        className="ia-row-metric"
                        data-tone={tone}
                        data-mono="true"
                        dir="ltr"
                      >
                        {delta >= 0 ? "+" : "−"}
                        {ILS.format(Math.round(Math.abs(delta)))}
                        {" "}
                        {delta >= 0 ? "מעל התחזית" : "מתחת לתחזית"}
                      </span>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}

        <footer className="ia-footer">
          <button
            type="button"
            className="ia-btn ia-btn-ghost"
            onClick={() => {
              hapticTap();
              onClose();
            }}
          >
            <X className="size-4" />
            ביטול
          </button>
          <button
            type="button"
            className="ia-btn ia-btn-primary"
            disabled={active.length === 0 || saving}
            onClick={commit}
          >
            <Check className="size-4" />
            שמור שינויים
          </button>
        </footer>
      </div>
    </>
  );
}

function mkParts(mk: string): [number, number] {
  const [y, m] = mk.split("-").map((x) => Number(x));
  return [y, m];
}
