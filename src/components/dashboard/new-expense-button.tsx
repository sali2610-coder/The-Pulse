"use client";

import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { tap } from "@/lib/haptics";

type Props = {
  onClick: () => void;
};

export function NewExpenseButton({ onClick }: Props) {
  return (
    <motion.button
      type="button"
      onClick={() => {
        tap();
        onClick();
      }}
      whileTap={{ scale: 0.97 }}
      whileHover={{ y: -1 }}
      className="group relative flex h-16 w-full items-center justify-center gap-3 overflow-hidden rounded-2xl border border-neon/40 bg-gradient-to-b from-surface to-background text-base font-medium text-foreground transition-shadow hover:glow-neon focus:outline-none focus:ring-2 focus:ring-neon/70"
    >
      <span
        aria-hidden
        className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            "linear-gradient(120deg, transparent 30%, rgba(0,229,255,0.18) 50%, transparent 70%)",
        }}
      />
      <span
        aria-hidden
        className="absolute inset-y-0 -inset-x-1/2 w-1/3 rotate-12 bg-gradient-to-r from-transparent via-white/15 to-transparent opacity-0 group-hover:opacity-100"
        style={{ animation: "shine 2.4s linear infinite" }}
      />
      <Plus className="relative size-5 text-neon" strokeWidth={2.4} />
      <span className="relative">תיעוד הוצאה חדשה</span>
    </motion.button>
  );
}
