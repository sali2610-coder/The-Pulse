"use client";

// Free-text search across the entry log. Lives in the History tab
// — the dashboard is calm-by-default; deep search is a deliberate
// drill-down. Debounced 200ms so iOS Safari doesn't redraw on
// every keystroke.

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, Tag } from "lucide-react";
import { toast } from "sonner";

import { useFinanceStore } from "@/lib/store";
import { searchEntries } from "@/lib/entry-search";
import { CATEGORIES, getCategory } from "@/lib/categories";
import type { CategoryId } from "@/lib/categories";
import { EASE_OUT_EXPO, STAGGER_TIGHT } from "@/lib/motion-tokens";
import { tap, success } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const DATE_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function fmtDate(iso: string): string {
  try {
    return DATE_FMT.format(new Date(iso));
  } catch {
    return iso;
  }
}

export function EntrySearchCard() {
  const entries = useFinanceStore((s) => s.entries);
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const updateExpense = useFinanceStore((s) => s.updateExpense);
  const [raw, setRaw] = useState("");
  const [query, setQuery] = useState("");
  const [bulkCategory, setBulkCategory] = useState<CategoryId | "">("");

  // 200ms debounce.
  useEffect(() => {
    const t = setTimeout(() => setQuery(raw), 200);
    return () => clearTimeout(t);
  }, [raw]);

  const hits = useMemo(() => {
    if (!hydrated) return [];
    return searchEntries(entries, query, { limit: 50 });
  }, [hydrated, entries, query]);

  if (!hydrated) return null;

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <header className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <Search className="size-3 text-[color:var(--neon)]" />
        חיפוש חיובים
      </header>

      <div className="relative">
        <input
          type="text"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="מרכז עסק, הערה, או 4 ספרות"
          aria-label="חיפוש חיובים"
          className="h-10 w-full rounded-2xl border border-white/8 bg-black/30 px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-[color:var(--neon)]/60"
        />
      </div>

      {query && hits.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-3 py-6 text-center text-[11px] text-muted-foreground">
          אין תוצאות עבור “{query}”
        </p>
      ) : null}

      {hits.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {hits.map((h, idx) => {
            const e = h.entry;
            const cat = getCategory(e.category);
            return (
              <motion.li
                key={e.id}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: Math.min(idx, 6) * STAGGER_TIGHT,
                  duration: 0.22,
                  ease: EASE_OUT_EXPO,
                }}
                className="flex items-center justify-between gap-2 rounded-2xl border border-white/8 bg-black/25 p-2.5 text-[11px]"
              >
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-foreground">
                    {e.merchant ?? e.note ?? cat.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {cat.label} · {fmtDate(e.chargeDate)}
                    {e.installments > 1 ? ` · ${e.installments} תשלומים` : ""}
                  </span>
                </div>
                <span
                  data-mono="true"
                  dir="ltr"
                  className="text-[12px] font-medium text-foreground"
                  style={{ color: e.isRefund ? "#34D399" : undefined }}
                >
                  {e.isRefund ? "+" : ""}
                  {ILS.format(e.amount)}
                </span>
              </motion.li>
            );
          })}
        </ul>
      ) : null}

      {query && hits.length > 0 ? (
        <p className="text-[10px] text-muted-foreground/80">
          {hits.length === 50 ? "מציג 50 ראשונים — חדד את החיפוש" : `${hits.length} תוצאות`}
        </p>
      ) : null}

      {/* Bulk re-categorize — visible only when there are hits.
         Lets the user fix a misclassified merchant across every
         match at once. Confirmation required because the action
         is non-trivially destructive. */}
      {hits.length > 0 ? (
        <div className="flex items-center gap-2 rounded-2xl border border-white/8 bg-black/25 px-3 py-2">
          <Tag className="size-3 text-[color:var(--neon)]" />
          <span className="text-[10.5px] text-muted-foreground">
            הגדר קטגוריה לכל התוצאות
          </span>
          <select
            value={bulkCategory}
            onChange={(e) => setBulkCategory(e.target.value as CategoryId | "")}
            aria-label="בחר קטגוריה"
            className="h-7 rounded-md border border-white/10 bg-background/40 px-1 text-[11px] text-foreground"
          >
            <option value="">—</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!bulkCategory}
            onClick={() => {
              if (!bulkCategory) return;
              if (
                typeof window !== "undefined" &&
                !window.confirm(
                  `לעדכן את הקטגוריה של ${hits.length} חיובים?`,
                )
              ) {
                return;
              }
              tap();
              let n = 0;
              for (const h of hits) {
                if (h.entry.category === bulkCategory) continue;
                updateExpense(h.entry.id, { category: bulkCategory });
                n += 1;
              }
              success();
              toast.success(`עודכנו ${n} חיובים`);
              setBulkCategory("");
            }}
            aria-label="עדכן קטגוריה לכל התוצאות"
            className="ms-auto flex h-7 items-center gap-1 rounded-md border border-[color:var(--neon)]/40 bg-[color:var(--neon)]/10 px-2 text-[10px] text-[color:var(--neon)] disabled:opacity-50"
          >
            עדכן
          </button>
        </div>
      ) : null}
    </section>
  );
}
