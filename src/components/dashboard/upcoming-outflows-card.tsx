"use client";

// Phase 278 — 7-day forward digest, grouped by day with inline
// expand. Each day is one folder card. Default state: all closed.
// User taps a day → its outflows fade-in below the row. Matches the
// "לאן הולך הכסף" UX language; replaces the long flat list that
// used to overload the Future tab.

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Banknote,
  CalendarDays,
  ChevronDown,
  Receipt,
  Repeat2,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { upcomingOutflows, type UpcomingOutflow } from "@/lib/upcoming-outflows";
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
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
});

const SHORT_FMT = new Intl.DateTimeFormat("he-IL", {
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

type DayGroup = {
  key: string;
  date: Date;
  daysUntil: number;
  total: number;
  items: UpcomingOutflow[];
};

function groupByDay(outflows: UpcomingOutflow[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const o of outflows) {
    const key = `${o.date.getFullYear()}-${String(o.date.getMonth() + 1).padStart(2, "0")}-${String(o.date.getDate()).padStart(2, "0")}`;
    const existing = map.get(key);
    if (existing) {
      existing.total += o.amount;
      existing.items.push(o);
    } else {
      map.set(key, {
        key,
        date: o.date,
        daysUntil: o.daysUntil,
        total: o.amount,
        items: [o],
      });
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
}

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

  const groups = useMemo(() => groupByDay(outflows), [outflows]);

  if (!hydrated) return null;
  if (outflows.length === 0) return null;

  const total = outflows.reduce((s, o) => s + o.amount, 0);
  const firstHeavy = groups.find((g) => g.total >= 1000);

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
              {groups.length} ימים · {outflows.length} חיובים
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

      {firstHeavy ? (
        <p
          className="rounded-xl border px-3 py-1.5 text-[11px]"
          style={{
            background: "#F8717115",
            borderColor: "#F8717140",
            color: "#FCA5A5",
          }}
        >
          ⚠️ חיוב כבד מתקרב · {SHORT_FMT.format(firstHeavy.date)} · −
          {ILS.format(Math.round(firstHeavy.total))}
        </p>
      ) : null}

      <ul className="flex flex-col gap-1.5">
        {groups.map((g, idx) => (
          <DayCard
            key={g.key}
            group={g}
            index={idx}
            onActivate={activate}
          />
        ))}
      </ul>

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

function DayCard({
  group,
  index,
  onActivate,
}: {
  group: DayGroup;
  index: number;
  onActivate: (kind: "entry" | "rule" | "loan", id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <motion.li
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx(index), duration: 0.22 }}
      className="overflow-hidden rounded-2xl border border-white/8 bg-black/25"
    >
      <button
        type="button"
        onClick={() => {
          tap();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-label={`${open ? "סגור" : "פתח"} ${DAY_FMT.format(group.date)}`}
        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-start hover:bg-white/3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60"
      >
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="text-[12.5px] font-medium text-foreground">
            {dayLabel(group.daysUntil)}
          </span>
          <span className="text-[10px] text-muted-foreground" dir="ltr">
            {DAY_FMT.format(group.date)} · {group.items.length} חיובים
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            data-mono="true"
            dir="ltr"
            className="text-[13.5px] font-semibold text-foreground"
          >
            −{ILS.format(Math.round(group.total))}
          </span>
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.18 }}
            className="text-muted-foreground"
            aria-hidden
          >
            <ChevronDown className="size-4" />
          </motion.span>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.ul
            key="body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-white/6"
          >
            {group.items.map((o) => {
              const meta = KIND_META[o.kind];
              const Icon = meta.Icon;
              return (
                <li
                  key={o.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onActivate(o.kind, o.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onActivate(o.kind, o.id);
                    }
                  }}
                  className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5 outline-none transition-colors hover:bg-white/3 focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60"
                >
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      background: `${meta.color}22`,
                      color: meta.color,
                    }}
                  >
                    <Icon className="size-3.5" strokeWidth={1.7} />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="truncate text-[12px] font-medium text-foreground">
                      {o.label}
                    </span>
                    <span
                      className="text-[10px]"
                      style={{ color: meta.color }}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <span
                    data-mono="true"
                    dir="ltr"
                    className="shrink-0 text-[12px] font-semibold text-foreground"
                  >
                    −{ILS.format(Math.round(o.amount))}
                  </span>
                </li>
              );
            })}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </motion.li>
  );
}

function idx(i: number): number {
  return Math.min(i * 0.035, 0.25);
}
