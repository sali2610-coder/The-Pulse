"use client";

// Subscription review suggestions. Lists active recurring rules the
// user should reconsider (stale, rising, duplicate-looking, low value).
// No mutation — the "לבדיקה" button just deep-links to the Settings
// panel where the user can edit/delete the rule manually.

import { useMemo } from "react";
import { SearchCheck } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import {
  subscriptionReview,
  type ReviewReason,
} from "@/lib/subscription-review";
import { navigateToTab } from "@/lib/tab-nav";
import { tap } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const REASON_TONE: Record<ReviewReason, string> = {
  stale_no_charge: "#A1A1AA",
  rising_price: "#F87171",
  duplicate_lookalike: "#D4AF37",
  low_value_signal: "#60A5FA",
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
  if (candidates.length === 0) return null;

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <header className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <SearchCheck className="size-3 text-[color:var(--neon)]" />
        מנויים לבדיקה
      </header>
      <ul className="flex flex-col gap-1.5">
        {candidates.map((c) => {
          const tone = REASON_TONE[c.reason];
          return (
            <li
              key={`${c.ruleId}:${c.reason}`}
              className="flex items-center gap-2 rounded-2xl border border-white/8 bg-black/25 p-2.5"
            >
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[12px] font-medium text-foreground">
                    {c.label}
                  </span>
                  <span
                    className="shrink-0 rounded-md px-1.5 py-0.5 text-[9px]"
                    style={{ background: `${tone}1a`, color: tone }}
                  >
                    {REASON_LABEL[c.reason]}
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
              <button
                type="button"
                onClick={() => {
                  tap();
                  navigateToTab("settings", "recurring-rules");
                }}
                className="shrink-0 rounded-md border border-[color:var(--neon)]/40 bg-[color:var(--neon)]/10 px-2 py-1 text-[10px] text-[color:var(--neon)]"
                aria-label={`לבדיקה ${c.label}`}
              >
                לבדיקה
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
