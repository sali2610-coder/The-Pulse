"use client";

// Home v2 · Primary Action Dock (premium rebuild).
//
// Signature bottom bar. Primary Expense is the dominant gold pill —
// the single tap the user reaches for 20× a day. Income is the
// smaller companion pill (safe-green) alongside it. Both sit inside
// a floating glass rail with an inner-glow hairline. Callback-only
// component: no engine / store / dialog / navigation logic.

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
      className="sally-dock-v2"
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduced ? 0.1 : 0.5,
        delay: reduced ? 0 : 0.12,
        ease: [0.32, 0.72, 0, 1],
      }}
    >
      <span aria-hidden className="sally-dock-v2-glow" />
      <div className="sally-dock-v2-inner">
        <motion.button
          type="button"
          className="sally-dock-v2-primary"
          aria-label="הוסף הוצאה חדשה"
          onClick={() => {
            hapticTap();
            onExpense();
          }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
        >
          <span aria-hidden className="sally-dock-v2-primary-halo" />
          <span aria-hidden className="sally-dock-v2-primary-icon">
            <MinusGlyph />
          </span>
          <span className="sally-dock-v2-primary-text">
            <span className="sally-dock-v2-primary-label">הוצאה</span>
            <span className="sally-dock-v2-primary-sub">תיעוד מהיר</span>
          </span>
        </motion.button>

        <motion.button
          type="button"
          className="sally-dock-v2-secondary"
          aria-label="הוסף הכנסה חדשה"
          onClick={() => {
            hapticTap();
            onIncome();
          }}
          whileTap={{ scale: 0.96 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
        >
          <span aria-hidden className="sally-dock-v2-secondary-icon">
            <PlusGlyph />
          </span>
          <span className="sally-dock-v2-secondary-label">הכנסה</span>
        </motion.button>
      </div>
    </motion.div>
  );
}

function MinusGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden fill="none">
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
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden fill="none">
      <path
        d="M10 4v12M4 10h12"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
