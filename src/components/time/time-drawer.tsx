"use client";

// Phase 358 / C — TimeDrawer.
//
// Pull-up drawer at the bottom of the TimeScreen. Reuses the existing
// FutureBalanceExplain (transparent breakdown) verbatim so there's
// only ONE breakdown component in the codebase. Above it: small
// signal cluster ("איך הגעתי לכאן") for the impatient.

import { motion } from "framer-motion";
import { ChevronUp } from "lucide-react";
import { useState } from "react";

import { FutureBalanceExplain } from "@/components/dashboard/simple/future-balance-explain";
import { tap } from "@/lib/haptics";

export function TimeDrawer({ offset }: { offset: number }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-4 flex flex-col gap-3 px-1">
      <button
        type="button"
        onClick={() => {
          tap();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-right text-[12.5px] text-foreground/85 transition-colors hover:border-white/16"
      >
        <ChevronUp
          className="size-4 text-muted-foreground transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          aria-hidden
        />
        <span className="flex flex-col gap-0.5 text-right">
          <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            פירוט
          </span>
          <span>איך הגעתי לכאן — מקור כל שקל</span>
        </span>
      </button>

      <motion.div
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        style={{ overflow: "hidden" }}
      >
        <div className="pt-1">
          <FutureBalanceExplain offset={offset} />
        </div>
      </motion.div>
    </section>
  );
}
