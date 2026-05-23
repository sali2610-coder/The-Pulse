"use client";

// "איך זה מחושב?" sheet primitive.
//
// Drops in next to any card header — renders a small "?" trigger
// that opens a BottomSheet listing the formula rows + exclusions
// from src/lib/explainability.ts. Everything else (motion, safe
// area, reduced motion, drag-to-dismiss) is inherited from the
// shared BottomSheet primitive (Phase 198 polish).

import { useState } from "react";
import { motion } from "framer-motion";
import { HelpCircle, Info } from "lucide-react";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { SectionHeader } from "@/components/ui/section-header";
import {
  InsightChip,
  type InsightSeverity,
} from "@/components/ui/insight-chip";
import type { Explanation } from "@/lib/explainability";
import type { ConfidenceReport } from "@/lib/confidence";
import { listReveal, CARD_TAP } from "@/lib/motion-tokens";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const CONFIDENCE_LABEL: Record<ConfidenceReport["level"], string> = {
  high: "אמינות גבוהה",
  medium: "אמינות בינונית",
  low: "אמינות נמוכה",
};

const CONFIDENCE_SEV: Record<ConfidenceReport["level"], InsightSeverity> = {
  high: "info",
  medium: "watch",
  low: "warn",
};

type Props = {
  explanation: Explanation;
  confidence?: ConfidenceReport | null;
  /** Hebrew text shown on the trigger; default "איך זה מחושב?". */
  triggerLabel?: string;
};

export function ExplainSheet({ explanation, confidence, triggerLabel }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <motion.button
        type="button"
        whileTap={CARD_TAP}
        onClick={() => setOpen(true)}
        aria-label={triggerLabel ?? "איך זה מחושב?"}
        className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[9px] tracking-[0.18em] text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60"
      >
        <HelpCircle className="size-2.5" />
        איך?
      </motion.button>

      <BottomSheet open={open} onOpenChange={setOpen} title={explanation.title}>
        <header className="flex flex-col gap-2">
          <SectionHeader
            icon={<Info />}
            title={explanation.title}
            trailing={
              confidence ? (
                <InsightChip
                  severity={CONFIDENCE_SEV[confidence.level]}
                  label={CONFIDENCE_LABEL[confidence.level]}
                />
              ) : null
            }
          />
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            {explanation.intro}
          </p>
          {confidence ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground/85">
              {confidence.basis}
            </p>
          ) : null}
        </header>

        <ul className="flex flex-col gap-1.5 rounded-2xl border border-white/8 bg-black/25 p-3">
          {explanation.lines.map((line, idx) => (
            <motion.li
              key={`${line.label}-${idx}`}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={listReveal(idx)}
              className={`flex items-baseline justify-between gap-3 ${
                line.total
                  ? "mt-1 rounded-xl border border-[color:var(--neon)]/30 bg-[color:var(--neon)]/8 px-3 py-2"
                  : "border-b border-white/4 pb-1 last:border-b-0"
              }`}
            >
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <span
                  className={`truncate ${
                    line.total
                      ? "text-[12px] font-semibold text-foreground"
                      : "text-[11.5px] text-muted-foreground"
                  }`}
                >
                  {line.label}
                </span>
                {line.meta ? (
                  <span className="text-[10px] text-muted-foreground/75">
                    {line.meta}
                  </span>
                ) : null}
              </div>
              <span
                data-mono="true"
                dir="ltr"
                className={`shrink-0 ${
                  line.total
                    ? "text-[14px] font-semibold text-foreground"
                    : "text-[12px] font-medium"
                }`}
                style={{
                  color: line.total
                    ? line.amount < 0
                      ? "#F87171"
                      : "#34D399"
                    : line.amount < 0
                      ? "#F87171"
                      : line.amount > 0
                        ? "#34D399"
                        : undefined,
                }}
              >
                {signed(line.amount)}
              </span>
            </motion.li>
          ))}
        </ul>

        {explanation.exclusions.length > 0 ? (
          <section className="flex flex-col gap-1.5 rounded-2xl border border-white/8 bg-black/20 p-3">
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              לא נספר
            </span>
            <ul className="flex flex-col gap-0.5">
              {explanation.exclusions.map((ex, idx) => (
                <li
                  key={idx}
                  className="text-[11px] leading-relaxed text-muted-foreground/85"
                >
                  · {ex}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </BottomSheet>
    </>
  );
}

function signed(n: number): string {
  if (n === 0) return ILS.format(0);
  const sign = n > 0 ? "+" : "−";
  return `${sign}${ILS.format(Math.abs(n))}`;
}
