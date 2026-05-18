"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Search, Sparkles } from "lucide-react";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { CATEGORIES, type CategoryId } from "@/lib/categories";
import { useFinanceStore } from "@/lib/store";
import { tap } from "@/lib/haptics";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected?: CategoryId;
  /** Optional category hint from the parser (`categorize(merchant)`). When
   *  present, surfaces a "מומלץ" suggestion chip at the top. */
  suggested?: CategoryId;
  onSelect: (id: CategoryId) => void;
};

/** How many recently-used categories to surface as a quick row. */
const RECENT_LIMIT = 4;

export function CategoryPickerSheet({
  open,
  onOpenChange,
  selected,
  suggested,
  onSelect,
}: Props) {
  const entries = useFinanceStore((s) => s.entries);
  const [query, setQuery] = useState("");

  // Recent = distinct categories from the user's last ~30 entries, ordered
  // by most-recently-used. Excludes the suggested one (already on its own
  // chip) so the row doesn't repeat content.
  const recent = useMemo<CategoryId[]>(() => {
    const seen = new Set<CategoryId>();
    const out: CategoryId[] = [];
    const window = [...entries].slice(-30).reverse();
    for (const e of window) {
      const id = e.category as CategoryId;
      if (seen.has(id)) continue;
      if (suggested && id === suggested) continue;
      seen.add(id);
      out.push(id);
      if (out.length >= RECENT_LIMIT) break;
    }
    return out;
  }, [entries, suggested]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CATEGORIES;
    return CATEGORIES.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q),
    );
  }, [query]);

  const pick = (id: CategoryId) => {
    tap();
    onSelect(id);
    onOpenChange(false);
  };

  const findCat = (id: CategoryId) => CATEGORIES.find((c) => c.id === id);

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="בחר קטגוריה">
      <div className="flex flex-col gap-2 pt-2">
        <h2 className="text-right text-lg font-semibold text-foreground">
          בחר קטגוריה
        </h2>
        <p className="text-right text-sm text-muted-foreground">
          הקש על קטגוריה כדי לסווג את החיוב.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute end-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חפש קטגוריה…"
          aria-label="חיפוש קטגוריה"
          className="h-10 w-full rounded-xl border border-white/10 bg-background/40 px-3 pe-8 text-right text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:border-[color:var(--neon)]/50 focus:outline-none"
        />
      </div>

      {/* Suggested / recent (hidden while searching) */}
      <AnimatePresence initial={false}>
        {!query && (suggested || recent.length > 0) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-col gap-3 overflow-hidden"
          >
            {suggested && findCat(suggested) ? (
              <ChipRow
                icon={<Sparkles className="size-3" />}
                label="מומלץ"
                accentColor="#D4AF37"
              >
                <CategoryChip
                  cat={findCat(suggested)!}
                  selected={selected === suggested}
                  onPick={pick}
                />
              </ChipRow>
            ) : null}

            {recent.length > 0 ? (
              <ChipRow
                icon={<Clock className="size-3" />}
                label="לאחרונה"
                accentColor="#00E5FF"
              >
                {recent.map((id) => {
                  const cat = findCat(id);
                  if (!cat) return null;
                  return (
                    <CategoryChip
                      key={id}
                      cat={cat}
                      selected={selected === id}
                      onPick={pick}
                    />
                  );
                })}
              </ChipRow>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>

      {/* All categories grid */}
      <div
        role="radiogroup"
        aria-label="קטגוריית הוצאה"
        className="grid grid-cols-3 gap-3"
      >
        {filtered.map((cat, idx) => {
          const Icon = cat.icon;
          const isSelected = selected === cat.id;
          return (
            <motion.button
              key={cat.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={cat.label}
              onClick={() => pick(cat.id)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: Math.min(idx, 8) * 0.025,
                type: "spring",
                stiffness: 280,
                damping: 24,
              }}
              whileTap={{ scale: 0.94 }}
              whileHover={{ y: -2 }}
              className={`group relative flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border bg-surface/70 p-3 text-center transition-colors ${
                isSelected
                  ? "border-[color:var(--neon)] bg-[color:var(--neon)]/8 shadow-[0_0_0_1px_var(--neon)] glow-neon"
                  : "border-white/8 hover:border-white/14"
              }`}
              style={{ color: isSelected ? cat.accent : undefined }}
            >
              <span
                className="flex h-12 w-12 items-center justify-center rounded-2xl"
                style={{ background: `${cat.accent}22`, color: cat.accent }}
              >
                <Icon className="h-6 w-6" strokeWidth={1.6} />
              </span>
              <span className="text-xs font-medium text-foreground/90">
                {cat.label}
              </span>
            </motion.button>
          );
        })}
        {filtered.length === 0 ? (
          <div className="col-span-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-5 text-center text-[12px] text-muted-foreground">
            לא נמצאה קטגוריה. נסה מילה אחרת.
          </div>
        ) : null}
      </div>
    </BottomSheet>
  );
}

function ChipRow({
  icon,
  label,
  accentColor,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  accentColor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em]"
        style={{ color: accentColor }}
      >
        {icon}
        {label}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function CategoryChip({
  cat,
  selected,
  onPick,
}: {
  cat: (typeof CATEGORIES)[number];
  selected: boolean;
  onPick: (id: CategoryId) => void;
}) {
  const Icon = cat.icon;
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95 }}
      onClick={() => onPick(cat.id)}
      className={`flex items-center gap-2 rounded-full border bg-surface/60 px-3 py-1.5 text-[12px] font-medium transition-colors ${
        selected
          ? "border-[color:var(--neon)]/70 text-[color:var(--neon)] shadow-[inset_0_0_0_1px_var(--neon)]"
          : "border-white/10 text-foreground/90 hover:border-white/20"
      }`}
      style={{
        backgroundColor: selected ? `${cat.accent}10` : undefined,
      }}
    >
      <Icon className="size-3.5" style={{ color: cat.accent }} />
      {cat.label}
    </motion.button>
  );
}
