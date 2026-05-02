"use client";

import { motion } from "framer-motion";
import { Minus, Plus } from "lucide-react";
import { tap } from "@/lib/haptics";

type Props = {
  value: number;
  onChange: (next: number) => void;
  amount: number | undefined;
};

const formatILS = (value: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: value < 100 ? 2 : 0,
  }).format(value);

export function InstallmentsInput({ value, onChange, amount }: Props) {
  const set = (next: number) => {
    const clamped = Math.max(1, Math.min(60, next));
    if (clamped !== value) tap();
    onChange(clamped);
  };

  const showSplit = value > 1 && amount !== undefined && amount > 0;
  const perMonth = showSplit ? amount! / value : 0;

  return (
    <div className="rounded-2xl border border-border/60 bg-surface/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">מספר תשלומים</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="הפחת תשלום"
            onClick={() => set(value - 1)}
            disabled={value <= 1}
            className="flex size-9 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:border-neon/50 hover:text-foreground disabled:opacity-30"
          >
            <Minus className="size-4" />
          </button>
          <div
            data-mono="true"
            className="w-10 text-center text-xl text-foreground"
            style={{ direction: "ltr" }}
          >
            {value}
          </div>
          <button
            type="button"
            aria-label="הוסף תשלום"
            onClick={() => set(value + 1)}
            disabled={value >= 60}
            className="flex size-9 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:border-neon/50 hover:text-foreground disabled:opacity-30"
          >
            <Plus className="size-4" />
          </button>
        </div>
      </div>

      {showSplit ? (
        <motion.div
          key={`${value}-${amount}`}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="mt-3 flex items-baseline justify-between border-t border-border/40 pt-3"
        >
          <span className="text-xs text-muted-foreground">חיוב חודשי</span>
          <span
            data-mono="true"
            className="text-base text-gold"
            style={{ direction: "ltr" }}
          >
            {formatILS(perMonth)}
          </span>
        </motion.div>
      ) : null}
    </div>
  );
}
