"use client";

// Single-lens obligations container. 'השבוע הבא' button and the
// UpcomingOutflowsCard reveal it drove were dropped: the Time-tab
// insight tiles already cover next-week visibility, so a duplicate
// day-oriented list was redundant.
//
// One full-width toggle:
//   [ התחייבויות ]  → inline reveal of CashflowBucketsCard (by-source
//                     breakdown: bank / cards / loans). Second tap
//                     collapses. UI / UX only — CashflowBucketsCard
//                     internals + every underlying engine untouched.

import dynamic from "next/dynamic";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Layers } from "lucide-react";

import { ErrorBoundary } from "@/components/error-boundary";
import { SectionHeader } from "@/components/ui/section-header";
import { tap } from "@/lib/haptics";

const lazy = (
  loader: () => Promise<{ default: React.ComponentType<Record<string, unknown>> }>,
) => dynamic(loader, { ssr: false });

const CashflowBucketsCard = lazy(() =>
  import("@/components/dashboard/cashflow-buckets-card").then((m) => ({
    default:
      m.CashflowBucketsCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

export function ObligationsAndWeek() {
  const [open, setOpen] = useState(false);

  return (
    <section className="glass-card flex flex-col gap-3 rounded-3xl p-5">
      <SectionHeader
        icon={<Layers />}
        title="התחייבויות עתידיות"
        trailing={
          <span className="text-caption text-muted-foreground">
            {open ? "לחץ לסגירה" : "לחץ לפתיחה"}
          </span>
        }
      />
      <p className="text-caption text-muted-foreground">
        פירוט לפי מקור: בנק, כרטיסים, הלוואות. כל חיוב עם סכום, שם
        ותאריך.
      </p>

      <LensToggle open={open} onToggle={() => {
        tap();
        setOpen((v) => !v);
      }} />

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <motion.div
              initial={{ y: 6, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{
                duration: 0.24,
                delay: 0.05,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="pt-2"
            >
              <ErrorBoundary name="CashflowBucketsCard">
                <CashflowBucketsCard />
              </ErrorBoundary>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function LensToggle({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onToggle}
      aria-pressed={open}
      aria-label={`${open ? "סגור" : "פתח"} פירוט התחייבויות לפי מקור`}
      title={`${open ? "סגור" : "פתח"} התחייבויות`}
      whileTap={{ scale: 0.985 }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
      className={`group relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-2xl border px-4 py-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60 ${
        open
          ? "border-[color:var(--neon)]/45 bg-[color:var(--neon)]/15"
          : "border-white/8 bg-black/30 hover:border-white/16"
      }`}
      style={
        open
          ? {
              boxShadow:
                "0 12px 40px -20px rgba(0, 229, 255, 0.55), inset 0 1px 0 rgba(255,255,255,0.08)",
            }
          : undefined
      }
    >
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex size-9 items-center justify-center rounded-xl ${
            open ? "bg-[color:var(--neon)]/22 text-[color:var(--neon)]" : "bg-white/6 text-foreground"
          }`}
          aria-hidden
        >
          <Layers className="size-4" />
        </span>
        <div className="flex flex-col leading-tight">
          <span
            className={`text-[13.5px] font-semibold ${open ? "text-[color:var(--neon)]" : "text-foreground"}`}
          >
            התחייבויות
          </span>
          <span className="text-[10.5px] text-muted-foreground/85">
            לפי מקור · בנק · כרטיסים · הלוואות
          </span>
        </div>
      </div>
      <motion.span
        animate={{ rotate: open ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        className={open ? "text-[color:var(--neon)]" : "text-muted-foreground/70"}
        aria-hidden
      >
        <ChevronDown className="size-4" />
      </motion.span>
    </motion.button>
  );
}
