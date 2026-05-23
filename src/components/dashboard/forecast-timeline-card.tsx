"use client";

// Phase 201 — Forecast Timeline card.
//
// Plain list of every upcoming financial event for the rest of the
// current month, sorted by day-of-month. Income inflows at top of
// each day, then outflows. Each row is a TimelineRow primitive so
// future timelines reuse the same shape.

import { useMemo } from "react";
import { motion } from "framer-motion";
import { CalendarClock, Sparkles } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import {
  forecastTimeline,
  type ForecastEvent,
  type ForecastTimelineKind,
} from "@/lib/forecast-timeline";
import { SectionHeader } from "@/components/ui/section-header";
import { TimelineRow } from "@/components/ui/timeline-row";
import { CardEmpty } from "@/components/ui/card-empty";
import { listReveal } from "@/lib/motion-tokens";

const ACCENT: Record<ForecastTimelineKind, string> = {
  salary: "#34D399",
  loan: "#F87171",
  recurring: "#60A5FA",
  card_slice: "#A78BFA",
  installment_plan: "#D4AF37",
};

const KIND_LABEL: Record<ForecastTimelineKind, string> = {
  salary: "הכנסה",
  loan: "הלוואה",
  recurring: "הוצאה קבועה",
  card_slice: "חיוב כרטיס",
  installment_plan: "פלאן תשלומים",
};

export function ForecastTimelineCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);

  const events = useMemo(() => {
    if (!hydrated) return [];
    return forecastTimeline({ entries, rules, loans, incomes });
  }, [hydrated, entries, rules, loans, incomes]);

  if (!hydrated) return null;

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <SectionHeader
        icon={<CalendarClock />}
        title="ציר זמן צפוי החודש"
        trailing={
          events.length > 0 ? (
            <span
              className="text-[10px] text-muted-foreground/70"
              dir="ltr"
              aria-label={`${events.length} אירועים`}
            >
              {events.length}
            </span>
          ) : null
        }
      />

      {events.length === 0 ? (
        <CardEmpty
          icon={<Sparkles className="size-4" />}
          title="לא נותרו אירועים החודש"
          reason="כל ההלוואות, ההכנסות והחיובים הקבועים של החודש כבר התרחשו."
          unlockHint="ההגדרות שלך פעילות — תחזית לחודש הבא תופיע כאן בעוד מספר ימים."
        />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {events.map((e, idx) => (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={listReveal(idx)}
            >
              <TimelineRow
                day={e.day}
                label={e.label}
                amount={e.amount}
                meta={metaFor(e)}
                accent={ACCENT[e.kind]}
              />
            </motion.div>
          ))}
        </ul>
      )}
    </section>
  );
}

function metaFor(e: ForecastEvent): string {
  const prefix = KIND_LABEL[e.kind];
  if (e.meta) return `${prefix} · ${e.meta}`;
  return prefix;
}
