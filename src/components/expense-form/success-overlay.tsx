"use client";

import { AnimatePresence, motion } from "framer-motion";

type Props = {
  open: boolean;
  onDone?: () => void;
};

export function SuccessOverlay({ open, onDone }: Props) {
  return (
    <AnimatePresence onExitComplete={onDone}>
      {open ? (
        <motion.div
          key="success"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-2xl bg-background/85 backdrop-blur-md"
          aria-live="polite"
        >
          <motion.svg
            width="120"
            height="120"
            viewBox="0 0 120 120"
            initial={{ scale: 0.6 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 18 }}
          >
            <motion.circle
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke="#00E5FF"
              strokeWidth="3"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
            <motion.path
              d="M38 62 L54 78 L84 46"
              fill="none"
              stroke="#D4AF37"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.45, delay: 0.3, ease: "easeOut" }}
            />
          </motion.svg>
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="text-base text-muted-foreground"
          >
            נשמר בהצלחה
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
