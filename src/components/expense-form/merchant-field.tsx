"use client";

// Phase 339 — smart store / place name field with chip suggestions.
//
// Reads prior entries from the Zustand store, picks the merchants
// the user has previously used under the currently-selected
// category, and renders them as tappable chips above the text
// input. Tap a chip → fills the field; typing freely is always
// allowed. New merchants captured at save time feed the next
// suggestion round automatically (the engine just walks entries).

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Plus, Store } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { tap as hapticTap } from "@/lib/haptics";
import {
  buildMerchantSuggestions,
  type MerchantSuggestion,
} from "@/lib/merchant-suggestions";
import type { CategoryId } from "@/lib/categories";

export function MerchantField({
  value,
  onChange,
  category,
  /** When true the field renders as a compact one-line input with a
   *  chip row above. Default matches the rest of the dialog spacing. */
  compact = true,
  placeholder = "שם מקום (לא חובה)",
}: {
  value: string | undefined;
  onChange: (next: string) => void;
  category: CategoryId | undefined;
  compact?: boolean;
  placeholder?: string;
}) {
  const entries = useFinanceStore((s) => s.entries);
  const suggestions = useMemo<MerchantSuggestion[]>(
    () =>
      buildMerchantSuggestions({
        entries,
        category,
        limit: 5,
      }),
    [entries, category],
  );

  const trimmed = (value ?? "").trim();
  const showChips = category && suggestions.length > 0;

  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <Store className="size-3 text-[color:var(--neon)]" />
        שם מקום
      </label>

      {showChips ? (
        <div
          className="flex flex-wrap gap-1.5"
          role="listbox"
          aria-label="הצעות שמות מקום"
        >
          {suggestions.map((s) => {
            const active = trimmed === s.label.trim();
            return (
              <motion.button
                key={s.key}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  hapticTap();
                  onChange(s.label);
                }}
                whileTap={{ scale: 0.96 }}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  active
                    ? "border-[color:var(--neon)]/60 bg-[color:var(--neon)]/15 text-[color:var(--neon)]"
                    : "border-white/10 bg-white/5 text-foreground/85 hover:border-white/20"
                }`}
              >
                {s.label}
              </motion.button>
            );
          })}
          {trimmed && !suggestions.some((s) => s.label.trim() === trimmed) ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--neon)]/40 bg-[color:var(--neon)]/10 px-2.5 py-1 text-[11px] font-medium text-[color:var(--neon)]"
              aria-label="חדש"
            >
              <Plus className="size-2.5" />
              חדש
            </span>
          ) : null}
        </div>
      ) : null}

      <input
        type="text"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={60}
        className={`rounded-2xl border border-white/10 bg-surface/60 px-3 text-foreground placeholder:text-muted-foreground/70 focus:border-[color:var(--neon)]/50 focus:outline-none ${
          compact ? "h-10 text-[13px]" : "h-11 text-body"
        }`}
        aria-label="שם מקום"
      />
    </div>
  );
}
