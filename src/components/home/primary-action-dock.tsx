"use client";

// Home v2 · Primary Action Dock.
//
// Sticky pill dock at the bottom of the Home tab. Houses the two
// primary actions of the entire app — Expense and Income. Both
// callbacks are supplied by the caller so this file never touches
// engine, store, dialog, or business logic. Pure UI shell.

import { motion, useReducedMotion } from "framer-motion";

import { tap as hapticTap } from "@/lib/haptics";

export function PrimaryActionDock({
  onExpense,
  onIncome,
}: {
  onExpense: () => void;
  onIncome: () => void;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      role="toolbar"
      aria-label="פעולות עיקריות"
      className="sally-dock"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduced ? 0.1 : 0.5,
        delay: reduced ? 0 : 0.15,
        ease: [0.32, 0.72, 0, 1],
      }}
    >
      <div className="sally-dock-inner">
        <DockButton
          label="הוצאה"
          tone="gold"
          icon={<MinusGlyph />}
          onClick={() => {
            hapticTap();
            onExpense();
          }}
          ariaLabel="הוסף הוצאה חדשה"
        />
        <span aria-hidden className="sally-dock-divider" />
        <DockButton
          label="הכנסה"
          tone="safe"
          icon={<PlusGlyph />}
          onClick={() => {
            hapticTap();
            onIncome();
          }}
          ariaLabel="הוסף הכנסה חדשה"
        />
      </div>
    </motion.div>
  );
}

function DockButton({
  label,
  tone,
  icon,
  onClick,
  ariaLabel,
}: {
  label: string;
  tone: "gold" | "safe";
  icon: React.ReactNode;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <motion.button
      type="button"
      className="sally-dock-button"
      data-aurora-tone={tone}
      aria-label={ariaLabel}
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
    >
      <span aria-hidden className="sally-dock-icon">
        {icon}
      </span>
      <span className="sally-dock-label">{label}</span>
    </motion.button>
  );
}

function MinusGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden fill="none">
      <path
        d="M4 10h12"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlusGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden fill="none">
      <path
        d="M10 4v12M4 10h12"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
