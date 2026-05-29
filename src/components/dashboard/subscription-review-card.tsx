"use client";

// Subscription review suggestions. Lists active recurring rules the
// user should reconsider (stale, rising, duplicate-looking, low value).
// No mutation — the "לבדיקה" button just deep-links to the Settings
// panel where the user can edit/delete the rule manually.

import { useMemo } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, SearchCheck } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import {
  subscriptionReview,
  type ReviewReason,
} from "@/lib/subscription-review";
import { navigateToTab } from "@/lib/tab-nav";
import { tap } from "@/lib/haptics";
import { SectionHeader } from "@/components/ui/section-header";
import {
  InsightChip,
  type InsightSeverity,
} from "@/components/ui/insight-chip";
import { CARD_TAP, listReveal } from "@/lib/motion-tokens";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const REASON_SEV: Record<ReviewReason, InsightSeverity> = {
  stale_no_charge: "info",
  rising_price: "warn",
  duplicate_lookalike: "watch",
  low_value_signal: "info",
};

const REASON_LABEL: Record<ReviewReason, string> = {
  stale_no_charge: "ללא חיוב לאחרונה",
  rising_price: "מחיר עולה",
  duplicate_lookalike: "נראה כפול",
  low_value_signal: "ערך נמוך",
};

export function SubscriptionReviewCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const rules = useFinanceStore((s) => s.rules);
  const entries = useFinanceStore((s) => s.entries);

  const candidates = useMemo(() => {
    if (!hydrated) return [];
    return subscriptionReview({ rules, entries });
  }, [hydrated, rules, entries]);

  if (!hydrated) return null;

  // Phase 296 — proudly surface the "all clear" state instead of
  // silently hiding. Builds trust that the auditor actually looked.
  if (candidates.length === 0) {
    return (
      <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
        <SectionHeader icon={<SearchCheck />} title="מנויים לבדיקה" />
        <div className="flex items-center gap-2 rounded-2xl border border-white/8 bg-black/25 p-3">
          <CheckCircle2 className="size-4 text-[#34D399]" />
          <div className="flex flex-col leading-tight">
            <span className="text-caption font-medium text-foreground">
              לא נמצאו חריגות במנויים
            </span>
            <span className="text-micro text-muted-foreground/85">
              המערכת בדקה את כל החוקים החוזרים שלך.
            </span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <SectionHeader
        icon={<SearchCheck />}
        title="מנויים לבדיקה"
        trailing={
          <span className="text-[10px] text-muted-foreground/70" dir="ltr">
            {candidates.length}
          </span>
        }
      />
      <ul className="flex flex-col gap-1.5">
        {candidates.map((c, idx) => (
          <motion.li
            key={`${c.ruleId}:${c.reason}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={listReveal(idx)}
            className="flex items-center gap-2 rounded-2xl border border-white/8 bg-black/25 p-2.5 transition-colors hover:border-white/14"
          >
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[12px] font-medium text-foreground">
                  {c.label}
                </span>
                <InsightChip
                  severity={REASON_SEV[c.reason]}
                  label={REASON_LABEL[c.reason]}
                />
                {/* Phase 296 — confidence chip. Empty when missing. */}
                <span
                  className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                  style={{
                    background:
                      c.confidence >= 0.9
                        ? "rgba(52,211,153,0.18)"
                        : "rgba(96,165,250,0.18)",
                    color: c.confidence >= 0.9 ? "#34D399" : "#60A5FA",
                  }}
                  aria-label={`רמת ביטחון ${Math.round(c.confidence * 100)} אחוז`}
                >
                  {Math.round(c.confidence * 100)}%
                </span>
              </div>
              <span className="text-[10.5px] text-muted-foreground/85">
                {c.reasonText}
              </span>
            </div>
            <span
              data-mono="true"
              dir="ltr"
              className="shrink-0 text-[11px] text-muted-foreground"
            >
              {ILS.format(c.amount)}
            </span>
            <motion.button
              type="button"
              whileTap={CARD_TAP}
              onClick={() => {
                tap();
                navigateToTab("settings", "recurring-rules");
              }}
              className="shrink-0 rounded-md border border-[color:var(--neon)]/40 bg-[color:var(--neon)]/10 px-2 py-1 text-[10px] text-[color:var(--neon)] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60"
              aria-label={`לבדיקה ${c.label}`}
            >
              לבדיקה
            </motion.button>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
