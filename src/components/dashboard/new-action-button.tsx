"use client";

// Phase 348 — Premium segmented CTA: [ הוצאה ] [ משיכה ].
//
// Replaces the single "תיעוד הוצאה חדשה" button. Two halves with
// distinct accents (neon for expense, gold for withdrawal) and a
// shared glass background so the dock still reads as one premium
// surface. Each side haptics + animates on tap; the parent owns
// the open-state for the two different sheets.

import { motion } from "framer-motion";
import { Receipt, Wallet } from "lucide-react";

import { tap } from "@/lib/haptics";

type Props = {
  onExpense: () => void;
  onWithdrawal: () => void;
};

export function NewActionButton({ onExpense, onWithdrawal }: Props) {
  return (
    <div
      role="group"
      aria-label="פעולה חדשה"
      className="relative flex h-16 w-full overflow-hidden rounded-2xl border border-white/12 bg-gradient-to-b from-surface to-background"
      style={{
        boxShadow: `0 18px 40px -24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)`,
      }}
    >
      <Half
        side="expense"
        label="הוצאה"
        icon={<Receipt className="size-5" strokeWidth={2.2} />}
        accent="#00E5FF"
        onClick={onExpense}
      />
      <span
        aria-hidden
        className="my-2 w-px shrink-0"
        style={{ background: "rgba(255,255,255,0.08)" }}
      />
      <Half
        side="withdrawal"
        label="משיכה"
        icon={<Wallet className="size-5" strokeWidth={2.2} />}
        accent="#D4AF37"
        onClick={onWithdrawal}
      />
    </div>
  );
}

function Half({
  side,
  label,
  icon,
  accent,
  onClick,
}: {
  side: "expense" | "withdrawal";
  label: string;
  icon: React.ReactNode;
  accent: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={() => {
        tap();
        onClick();
      }}
      whileTap={{ scale: 0.96 }}
      aria-label={`פתח ${label} חדשה`}
      className="group relative flex flex-1 items-center justify-center gap-2 overflow-hidden text-[15px] font-medium text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset"
      style={{
        // Subtle accent tint per side that brightens on hover.
        ["--accent" as string]: accent,
      }}
    >
      <span
        aria-hidden
        className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `linear-gradient(120deg, transparent 30%, ${accent}22 50%, transparent 70%)`,
        }}
      />
      <span
        aria-hidden
        className="absolute inset-y-2 inset-x-2 rounded-xl opacity-0 transition-opacity duration-200 group-active:opacity-100"
        style={{
          background: `${accent}14`,
          boxShadow: `inset 0 0 0 1px ${accent}55`,
        }}
      />
      <span className="relative" style={{ color: accent }}>
        {icon}
      </span>
      <span className="relative">{label}</span>
      {/* Tiny side hint badge */}
      <span
        aria-hidden
        className="relative ms-0.5 rounded-full px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.18em]"
        style={{
          color: accent,
          background: `${accent}1a`,
          boxShadow: `inset 0 0 0 1px ${accent}44`,
        }}
      >
        {side === "expense" ? "−" : "↓"}
      </span>
    </motion.button>
  );
}
