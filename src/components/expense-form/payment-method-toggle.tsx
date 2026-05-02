"use client";

import { motion } from "framer-motion";
import { Banknote, CreditCard } from "lucide-react";
import type { PaymentMethod } from "@/types/finance";
import { tap } from "@/lib/haptics";

type Props = {
  value: PaymentMethod;
  onChange: (next: PaymentMethod) => void;
};

const OPTIONS: Array<{
  id: PaymentMethod;
  label: string;
  icon: typeof Banknote;
}> = [
  { id: "credit", label: "אשראי", icon: CreditCard },
  { id: "cash", label: "מזומן", icon: Banknote },
];

export function PaymentMethodToggle({ value, onChange }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="אמצעי תשלום"
      className="grid grid-cols-2 gap-2 rounded-2xl border border-border/60 bg-surface/50 p-1.5"
    >
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => {
              if (!selected) tap();
              onChange(opt.id);
            }}
            className="relative flex h-10 items-center justify-center gap-2 rounded-xl text-sm transition-colors"
          >
            {selected ? (
              <motion.span
                layoutId="payment-pill"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className="absolute inset-0 rounded-xl border border-neon/40 bg-background/80 shadow-[0_0_18px_-6px_rgba(0,229,255,0.55)]"
              />
            ) : null}
            <span
              className={`relative flex items-center gap-2 ${
                selected ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <Icon className="size-4" />
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
