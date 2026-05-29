"use client";

// Phase 287 — single dynamic container that merges the two heaviest
// stacked sections on the Future tab into one button-driven module.
//
//   [ התחייבויות ]  [ השבוע הבא ]
//
// Default state: both closed. The user picks which lens they want
// and the matching content (CashflowBucketsCard / UpcomingOutflowsCard)
// reveals with a smooth height + opacity transition. Switching
// between buttons closes the previous panel before opening the next
// via AnimatePresence `mode="wait"` — no overlap, no jump.
//
// Engine / data / inner UX of the two cards is completely untouched.

import dynamic from "next/dynamic";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, ChevronDown, Layers } from "lucide-react";

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
const UpcomingOutflowsCard = lazy(() =>
  import("@/components/dashboard/upcoming-outflows-card").then((m) => ({
    default:
      m.UpcomingOutflowsCard as unknown as React.ComponentType<Record<string, unknown>>,
  })),
);

type Lens = "obligations" | "week";

export function ObligationsAndWeek() {
  const [open, setOpen] = useState<Lens | null>(null);

  return (
    <section className="glass-card flex flex-col gap-3 rounded-3xl p-5">
      <SectionHeader
        icon={<Layers />}
        title="התחייבויות עתידיות"
        trailing={
          <span className="text-caption text-muted-foreground">
            בחר מבט
          </span>
        }
      />
      <p className="text-caption text-muted-foreground">
        שתי זוויות על אותם חיובים: לפי מקור (בנק, כרטיסים, הלוואות)
        או לפי הימים הקרובים. רק אחת נפתחת בכל פעם.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <LensButton
          active={open === "obligations"}
          icon={<Layers className="size-3.5" />}
          label="התחייבויות"
          sub="לפי מקור"
          onClick={() => {
            tap();
            setOpen(open === "obligations" ? null : "obligations");
          }}
        />
        <LensButton
          active={open === "week"}
          icon={<CalendarDays className="size-3.5" />}
          label="השבוע הבא"
          sub="לפי ימים"
          onClick={() => {
            tap();
            setOpen(open === "week" ? null : "week");
          }}
        />
      </div>

      <AnimatePresence initial={false} mode="wait">
        {open ? (
          <motion.div
            key={open}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <motion.div
              initial={{ y: 6, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{
                duration: 0.22,
                delay: 0.05,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="pt-1"
            >
              <ErrorBoundary name={open === "obligations" ? "CashflowBucketsCard" : "UpcomingOutflowsCard"}>
                {open === "obligations" ? (
                  <CashflowBucketsCard />
                ) : (
                  <UpcomingOutflowsCard />
                )}
              </ErrorBoundary>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function LensButton({
  active,
  icon,
  label,
  sub,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group relative flex items-center justify-between gap-2 overflow-hidden rounded-2xl border px-4 py-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60 ${
        active
          ? "border-[color:var(--neon)]/40 bg-[color:var(--neon)]/15"
          : "border-white/8 bg-black/30 hover:border-white/16"
      }`}
      style={
        active
          ? {
              boxShadow:
                "0 12px 40px -20px rgba(0, 229, 255, 0.55), inset 0 1px 0 rgba(255,255,255,0.07)",
            }
          : undefined
      }
    >
      <div className="flex flex-col leading-tight">
        <span
          className={`text-[12px] font-medium ${active ? "text-[color:var(--neon)]" : "text-foreground"}`}
        >
          <span className="me-1.5 inline-flex size-5 items-center justify-center rounded-md bg-white/8 align-middle">
            {icon}
          </span>
          {label}
        </span>
        <span className="text-[10px] text-muted-foreground/85">{sub}</span>
      </div>
      <motion.span
        animate={{ rotate: active ? 180 : 0 }}
        transition={{ duration: 0.2 }}
        className={active ? "text-[color:var(--neon)]" : "text-muted-foreground/70"}
        aria-hidden
      >
        <ChevronDown className="size-4" />
      </motion.span>
    </button>
  );
}
