"use client";

import { motion } from "framer-motion";
import { CATEGORIES, type CategoryId } from "@/lib/categories";
import { tap } from "@/lib/haptics";

type Props = {
  value: CategoryId | undefined;
  onChange: (next: CategoryId) => void;
};

export function CategoryGrid({ value, onChange }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="קטגוריית הוצאה"
      className="grid grid-cols-3 gap-2.5"
    >
      {CATEGORIES.map((cat) => {
        const Icon = cat.icon;
        const selected = value === cat.id;
        return (
          <motion.button
            key={cat.id}
            type="button"
            role="radio"
            aria-checked={selected}
            whileTap={{ scale: 0.92 }}
            whileHover={{ y: -1 }}
            onClick={() => {
              tap();
              onChange(cat.id);
            }}
            className={`group relative flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border bg-surface/60 px-2 transition-all focus:outline-none ${
              selected
                ? "border-neon/70 glow-neon"
                : "border-border/60 hover:border-border"
            }`}
            style={
              selected
                ? ({
                    "--tw-ring-color": cat.accent,
                  } as React.CSSProperties)
                : undefined
            }
          >
            <Icon
              className="size-6 transition-transform group-hover:scale-110"
              style={{ color: selected ? cat.accent : "#A8A8A8" }}
              strokeWidth={selected ? 2.2 : 1.8}
            />
            <span
              className={`text-xs ${selected ? "text-foreground" : "text-muted-foreground"}`}
            >
              {cat.label}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
