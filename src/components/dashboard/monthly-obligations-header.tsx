"use client";

// Phase 317 — 3-tile KPI strip for the Home obligations section.
// Sits above LoanSummaryCard + HousingCard to anchor the user in
// the bottom line: how much leaves the account monthly, how much
// is loans, how much is recurring bills.
//
// Phase 408 — added inline "פירוט" disclosure under each tile so
// the user can read the EXACT formula behind every number without
// leaving the surface. No engine math is touched.

import { useState } from "react";
import { useMemo } from "react";
import { Banknote, ChevronDown, Home, Info, Receipt } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { buildObligationsOverview } from "@/lib/obligations-overview";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export function MonthlyObligationsHeader() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const loans = useFinanceStore((s) => s.loans);
  const rules = useFinanceStore((s) => s.rules);
  const accounts = useFinanceStore((s) => s.accounts);
  const [open, setOpen] = useState(false);

  const overview = useMemo(() => {
    if (!hydrated) return null;
    return buildObligationsOverview({
      loans,
      rules,
      accounts,
      monthKey: currentMonthKey(),
    });
  }, [hydrated, loans, rules, accounts]);

  if (!hydrated || !overview) return null;
  if (overview.monthlyTotal === 0) return null;

  return (
    <section className="glass-card rounded-3xl p-4">
      <header className="mb-3 flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          תמונת מצב חודשית
        </span>
        <span
          data-mono="true"
          dir="ltr"
          className="text-[10px] text-muted-foreground/80"
        >
          {overview.monthKey}
        </span>
      </header>
      <div className="grid grid-cols-3 gap-2">
        <Tile
          icon={<Receipt className="size-3.5" />}
          label="סה״כ החודש"
          value={ILS.format(overview.monthlyTotal)}
          tone="#F87171"
          emphasis
        />
        <Tile
          icon={<Banknote className="size-3.5" />}
          label="הלוואות"
          value={ILS.format(overview.loansMonthly)}
          tone="#A78BFA"
        />
        <Tile
          icon={<Home className="size-3.5" />}
          label="קבועים"
          value={ILS.format(overview.fixedMonthly)}
          tone="#D4AF37"
        />
      </div>

      {/* Phase 408 — formula explainer. User has reported confusion
         between this number and the cockpit "סך התחייבויות" header
         (which also adds the credit + cash lanes). This inline
         disclosure spells out the exact composition + scope of
         every KPI so the relationship is reproducible from the UI. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-3 flex w-full items-center justify-between gap-2 rounded-2xl border border-white/8 bg-white/[0.02] px-3 py-2 text-[11.5px] text-muted-foreground transition-colors hover:border-white/16"
        dir="rtl"
      >
        <span className="flex items-center gap-1.5">
          <Info className="size-3.5" />
          איך מחושב כל מספר?
        </span>
        <ChevronDown
          className="size-3.5 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : undefined }}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          className="mt-2 flex flex-col gap-2 rounded-2xl border border-white/8 bg-black/30 p-3 text-[11.5px] leading-relaxed text-foreground/85"
          dir="rtl"
        >
          <Row
            tone="#F87171"
            label="סה״כ החודש"
            formula="הלוואות + חיובים קבועים בנקאיים"
            note="לא כולל חיובי אשראי (שמופיעים ב-״כרטיסי אשראי לפי חודש״) ולא כולל הוצאות יומיומיות."
            valueText={ILS.format(overview.monthlyTotal)}
          />
          <Row
            tone="#A78BFA"
            label="הלוואות"
            formula="Σ הלוואה פעילה לחודש הנוכחי × תשלום חודשי"
            note={`${overview.loans.length} ${
              overview.loans.length === 1 ? "הלוואה" : "הלוואות"
            } בחישוב.`}
            valueText={ILS.format(overview.loansMonthly)}
          />
          <Row
            tone="#D4AF37"
            label="קבועים"
            formula="Σ חיובים קבועים שאינם מחויבים בכרטיס אשראי"
            note="לדוגמה הוראות קבע מהבנק, הוצאות שכר דירה, חשבונות מים/חשמל וכל מנוי שאינו על כרטיס. חיובים על כרטיס נכנסים ל-״כרטיסי אשראי לפי חודש״."
            valueText={ILS.format(overview.fixedMonthly)}
          />
          <p className="border-t border-white/8 pt-2 text-[10.5px] text-muted-foreground/80">
            ההפרש מול ״סך התחייבויות החודש״ בלשונית הוצאות נובע מכך
            שאותו מסך כולל גם את אשראי ומזומן. כאן אנחנו מתמקדים רק
            במה שיורד אוטומטית מהבנק (קבועים + הלוואות).
          </p>
        </div>
      ) : null}
    </section>
  );
}

function Row({
  tone,
  label,
  formula,
  note,
  valueText,
}: {
  tone: string;
  label: string;
  formula: string;
  note: string;
  valueText: string;
}) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-xl border border-white/6 bg-white/[0.02] p-2.5"
      dir="rtl"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ background: tone }}
          />
          <span className="font-medium" style={{ color: tone }}>
            {label}
          </span>
        </span>
        <span
          data-mono="true"
          dir="ltr"
          className="font-medium"
          style={{ color: tone }}
        >
          {valueText}
        </span>
      </div>
      <span className="text-[11px] text-muted-foreground">
        נוסחה: {formula}
      </span>
      <span className="text-[10.5px] text-muted-foreground/80">{note}</span>
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
  tone,
  emphasis = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-white/8 bg-black/25 p-2.5">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
        <span style={{ color: tone }}>{icon}</span>
        {label}
      </span>
      <span
        data-mono="true"
        dir="ltr"
        className={
          emphasis
            ? "text-[16px] font-semibold"
            : "text-[14px] font-medium"
        }
        style={{ color: tone }}
      >
        {value}
      </span>
    </div>
  );
}
