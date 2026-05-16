"use client";

import { motion } from "framer-motion";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { CATEGORIES, type CategoryId } from "@/lib/categories";
import { tap } from "@/lib/haptics";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected?: CategoryId;
  onSelect: (id: CategoryId) => void;
};

export function CategoryPickerSheet({
  open,
  onOpenChange,
  selected,
  onSelect,
}: Props) {
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

      <div className="grid grid-cols-3 gap-3">
        {CATEGORIES.map((cat, idx) => {
          const Icon = cat.icon;
          const isSelected = selected === cat.id;
          return (
            <motion.button
              key={cat.id}
              type="button"
              onClick={() => {
                tap();
                onSelect(cat.id);
                onOpenChange(false);
              }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: idx * 0.025,
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
              style={{
                color: isSelected ? cat.accent : undefined,
              }}
            >
              <span
                className="flex h-12 w-12 items-center justify-center rounded-2xl"
                style={{
                  background: `${cat.accent}22`,
                  color: cat.accent,
                }}
              >
                <Icon className="h-6 w-6" strokeWidth={1.6} />
              </span>
              <span className="text-xs font-medium text-foreground/90">
                {cat.label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </BottomSheet>
  );
}
