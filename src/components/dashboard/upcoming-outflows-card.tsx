"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Banknote,
  CalendarDays,
  ChevronLeft,
  Receipt,
  Repeat2,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { upcomingOutflows } from "@/lib/upcoming-outflows";
import { ExpenseEditSheet } from "@/components/dashboard/expense-edit-sheet";
import { navigateToTab } from "@/lib/tab-nav";
import { tap } from "@/lib/haptics";
import type { ExpenseEntry } from "@/types/finance";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

function dayLabel(daysUntil: number): string {
  if (daysUntil === 0) return "היום";
  if (daysUntil === 1) return "מחר";
  return `עוד ${daysUntil} ימים`;
}

const KIND_META = {
  entry: { Icon: Receipt, color: "#00E5FF", label: "חיוב" },
  rule: { Icon: Repeat2, color: "#D4AF37", label: "קבוע" },
  loan: { Icon: Banknote, color: "#A78BFA", label: "הלוואה" },
} as const;

/**
 * 7-day forward outflow digest. Aggregates entry slices, pending
 * recurring rules, and active loan installments into a single
 * ordered list so the user knows exactly what's landing on the
 * checking account this week. Renders nothing on a calm week.
 */
export function UpcomingOutflowsCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const loans = useFinanceStore((s) => s.loans);

  const [editEntry, setEditEntry] = useState<ExpenseEntry | null>(null);

  const outflows = useMemo(() => {
    if (!hydrated) return [];
    return upcomingOutflows({
      entries,
      rules,
      statuses,
      loans,
      horizonDays: 7,
    });
  }, [hydrated, entries, rules, statuses, loans]);

  if (!hydrated) return null;
  if (outflows.length === 0) return null;

  const total = outflows.reduce((s, o) => s + o.amount, 0);

  function activate(kind: "entry" | "rule" | "loan", id: string) {
    tap();
    if (kind === "rule") {
      navigateToTab("settings", "recurring-rules");
      return;
    }
    if (kind === "loan") {
      navigateToTab("settings", "loans");
      return;
    }
    // entry — `id` is the synthetic outflow id "e:<entryId>:<monthKey>".
    const entryId = id.split(":")[1];
    const entry = entries.find((e) => e.id === entryId);
    if (entry) setEditEntry(entry);
  }

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gold/15 text-gold">
            <CalendarDays className="size-4" strokeWidth={1.8} />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-[11px] uppercase tracking-[0.22em] text-gold">
              השבוע הבא
            </span>
            <span className="text-[11.5px] text-muted-foreground">
              חיובים שמתוכננים ב־7 הימים הקרובים
            </span>
          </div>
        </div>
        <span
          data-mono="true"
          dir="ltr"
          className="text-[15px] font-semibold text-destructive"
        >
          −{ILS.format(total)}
        </span>
      </header>

      <ul className="flex flex-col gap-1.5">
        {outflows.slice(0, 6).map((o, idx) => {
          const meta = KIND_META[o.kind];
          const Icon = meta.Icon;
          return (
            <motion.li
              key={o.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04, duration: 0.22 }}
              whileTap={{ scale: 0.99 }}
              role="button"
              tabIndex={0}
              onClick={() => activate(o.kind, o.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  activate(o.kind, o.id);
                }
              }}
              className="flex cursor-pointer items-center gap-2.5 rounded-2xl border border-white/8 bg-black/25 p-2.5 outline-none transition-colors hover:border-white/14 focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60"
            >
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                style={{
                  background: `${meta.color}22`,
                  color: meta.color,
                }}
              >
                <Icon className="size-3.5" strokeWidth={1.7} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-[12.5px] font-medium text-foreground">
                  {o.label}
                </span>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span>{dayLabel(o.daysUntil)}</span>
                  <span>·</span>
                  <span dir="ltr">{DAY_FMT.format(o.date)}</span>
                  <span>·</span>
                  <span style={{ color: meta.color }}>{meta.label}</span>
                </div>
              </div>
              <span
                data-mono="true"
                dir="ltr"
                className="shrink-0 text-[12.5px] font-semibold text-foreground"
              >
                −{ILS.format(o.amount)}
              </span>
              <ChevronLeft className="size-3 shrink-0 text-muted-foreground/70" />
            </motion.li>
          );
        })}
      </ul>

      {outflows.length > 6 ? (
        <p className="text-[10px] text-muted-foreground">
          ועוד {outflows.length - 6} פריטים בשבוע
        </p>
      ) : null}

      <ExpenseEditSheet
        key={editEntry?.id ?? "none"}
        open={editEntry !== null}
        onOpenChange={(o) => {
          if (!o) setEditEntry(null);
        }}
        entry={editEntry}
      />
    </section>
  );
}
