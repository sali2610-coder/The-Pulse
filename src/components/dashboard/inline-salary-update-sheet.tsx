"use client";

// Phase 211 — inline "salary received" sheet.
//
// Pops a 30-second BottomSheet directly on the dashboard so the
// user can update the bank anchor without traveling to Settings.
// Lists every active bank account; user types the new balance per
// account (or skips). Saves via setAnchor (already battle-tested
// since Phase 193 — repeated edits persist reliably).

import { useState } from "react";
import { motion } from "framer-motion";
import { Banknote, Check } from "lucide-react";
import { toast } from "sonner";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useFinanceStore } from "@/lib/store";
import { SectionHeader } from "@/components/ui/section-header";
import { CARD_TAP } from "@/lib/motion-tokens";
import { success, tap } from "@/lib/haptics";

const ILS_INT = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

function formatSignedILS(value: number): string {
  if (value === 0) return ILS_INT.format(0);
  const sign = value > 0 ? "+" : "−";
  return `${sign}${ILS_INT.format(Math.abs(value))}`;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Draft = {
  accountId: string;
  label: string;
  current: number;
  sign: 1 | -1;
  magnitude: string;
};

export function InlineSalaryUpdateSheet({ open, onOpenChange }: Props) {
  const accounts = useFinanceStore((s) => s.accounts);
  const setAnchor = useFinanceStore((s) => s.setAnchor);

  // Build a fresh draft each time the sheet opens via the `open`
  // key on the local state init. Keeps user edits scoped to the
  // open session.
  const banks = accounts.filter(
    (a) => a.active && a.kind === "bank" && typeof a.anchorBalance === "number",
  );

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="עדכון יתרות בנק"
    >
      <SheetBody banks={banks} onSave={setAnchor} onClose={() => onOpenChange(false)} />
    </BottomSheet>
  );
}

function SheetBody({
  banks,
  onSave,
  onClose,
}: {
  banks: ReturnType<typeof useFinanceStore.getState>["accounts"];
  onSave: (id: string, value: number) => void;
  onClose: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    const out: Record<string, Draft> = {};
    for (const a of banks) {
      const current = a.anchorBalance ?? 0;
      out[a.id] = {
        accountId: a.id,
        label: a.label,
        current,
        sign: current < 0 ? -1 : 1,
        magnitude: String(Math.abs(current || 0)),
      };
    }
    return out;
  });

  if (banks.length === 0) {
    return (
      <p className="text-center text-[12px] text-muted-foreground">
        אין חשבונות בנק עם יתרה. הגדר חשבון תחילה דרך הגדרות → חשבונות.
      </p>
    );
  }

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function computedValue(d: Draft): number {
    const parsed = Number(d.magnitude.replace(/[^\d.]/g, ""));
    const safe = Number.isFinite(parsed) ? parsed : 0;
    return safe * d.sign;
  }

  function commit() {
    let touched = 0;
    for (const d of Object.values(drafts)) {
      const next = computedValue(d);
      if (next === d.current) continue;
      onSave(d.accountId, next);
      // Phase 218 — append to local trajectory history.
      void import("@/lib/anchor-history").then((m) =>
        m.appendAnchorPoint({
          accountId: d.accountId,
          label: d.label,
          balance: next,
        }),
      );
      touched++;
    }
    if (touched > 0) {
      success();
      toast.success(
        touched === 1
          ? "יתרה עודכנה"
          : `${touched} יתרות עודכנו`,
      );
    } else {
      tap();
      toast.message("לא חלו שינויים");
    }
    onClose();
  }

  return (
    <>
      <SectionHeader
        icon={<Banknote />}
        title="עדכון יתרות בנק"
        trailing={
          <span className="text-[10px] text-muted-foreground/85">
            עדכן אחרי משכורת
          </span>
        }
      />
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">
        הזן יתרה נוכחית לכל חשבון פעיל. Pulse יחשב מחדש את הסכום
        הבטוח לבזבוז מיד אחרי השמירה.
      </p>

      <div className="flex flex-col gap-2">
        {Object.values(drafts).map((d) => (
          <BankRow
            key={d.accountId}
            draft={d}
            onChange={(p) => updateDraft(d.accountId, p)}
            computed={computedValue(d)}
          />
        ))}
      </div>

      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        onClick={commit}
        className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[color:var(--neon)]/85 text-[14px] font-semibold text-[#050505] outline-none transition-colors hover:bg-[color:var(--neon)] focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]"
      >
        <Check className="size-4" strokeWidth={2.4} />
        שמור
      </motion.button>
    </>
  );
}

function BankRow({
  draft,
  onChange,
  computed,
}: {
  draft: Draft;
  onChange: (p: Partial<Draft>) => void;
  computed: number;
}) {
  const dirty = computed !== draft.current;
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-white/10 bg-black/30 p-3">
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate text-foreground">{draft.label}</span>
        <span
          data-mono="true"
          dir="ltr"
          style={{ color: draft.current < 0 ? "#F87171" : "#34D399" }}
        >
          {formatSignedILS(draft.current)} ← {formatSignedILS(computed)}
        </span>
      </div>
      <div
        dir="ltr"
        className="flex items-stretch overflow-hidden rounded-xl border border-white/10 bg-surface/60"
      >
        <motion.button
          type="button"
          whileTap={CARD_TAP}
          onClick={() => onChange({ sign: draft.sign === 1 ? -1 : 1 })}
          aria-label={draft.sign === -1 ? "חיובי" : "שלילי"}
          className={`flex w-10 shrink-0 items-center justify-center text-[14px] font-semibold transition-colors ${
            draft.sign === -1
              ? "bg-[#F87171]/15 text-[#F87171]"
              : "bg-white/5 text-foreground/70 hover:bg-white/10"
          }`}
        >
          {draft.sign === -1 ? "−" : "+"}
        </motion.button>
        <span className="flex items-center pl-3 text-sm text-muted-foreground">
          ₪
        </span>
        <input
          type="text"
          inputMode="decimal"
          pattern="[0-9.]*"
          dir="ltr"
          value={draft.magnitude}
          onChange={(e) =>
            onChange({ magnitude: e.target.value.replace(/[^\d.]/g, "") })
          }
          aria-label={`יתרה חדשה — ${draft.label}`}
          className="h-11 flex-1 bg-transparent px-3 text-[18px] font-light text-foreground outline-none"
        />
      </div>
      {dirty ? (
        <span className="text-[10px] text-[color:var(--neon)]">
          ישתנה ב־{formatSignedILS(computed - draft.current)}
        </span>
      ) : null}
    </div>
  );
}
