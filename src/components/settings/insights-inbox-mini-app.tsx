"use client";

// Phase 416 — Insights inbox.
//
// Merges the four prior cards (RecurringSuggestionsCard,
// RuleDriftCard, SubscriptionSuggestions, DormantRulesCard) into
// one mini-app with filter chips. Each existing card already
// carries its own primary action (accept / dismiss / dive in); the
// inbox composes them under one hero + one chip filter so the
// user reads ONE feed of decisions instead of stacks of widgets.

import { useState } from "react";
import { Bell } from "lucide-react";

import { MiniAppStatusHero } from "@/components/ui/mini-app-shell";
import { RecurringSuggestionsCard } from "@/components/settings/recurring-suggestions-card";
import { RuleDriftCard } from "@/components/settings/rule-drift-card";
import { SubscriptionSuggestions } from "@/components/settings/subscription-suggestions";
import { DormantRulesCard } from "@/components/settings/dormant-rules-card";

type Filter = "all" | "recurring" | "subscriptions" | "drift" | "dormant";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "הכל" },
  { id: "recurring", label: "חיובים חוזרים" },
  { id: "subscriptions", label: "מנויים שזוהו" },
  { id: "drift", label: "שחיקת קצב" },
  { id: "dormant", label: "חוקים רדומים" },
];

export function InsightsInboxMiniApp() {
  const [filter, setFilter] = useState<Filter>("all");

  return (
    <div className="flex flex-col gap-3" dir="rtl">
      <MiniAppStatusHero
        tone="#22D3EE"
        icon={Bell}
        title="תובנות לאישור"
        detail="חיובים חוזרים שזוהו, מנויים נסתרים, שחיקת קצב וכללים רדומים. אשר או דחה כל פריט."
      />

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className="rounded-full px-3 py-1 text-[11px] font-medium transition-colors"
              style={{
                color: active ? "#1A140A" : "rgba(255,255,255,0.85)",
                background: active
                  ? "linear-gradient(180deg,#F6D970 0%,#D4AF37 100%)"
                  : "rgba(255,255,255,0.04)",
                border: active
                  ? "1px solid transparent"
                  : "1px solid rgba(255,255,255,0.10)",
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {filter === "all" || filter === "recurring" ? (
        <RecurringSuggestionsCard />
      ) : null}
      {filter === "all" || filter === "subscriptions" ? (
        <SubscriptionSuggestions />
      ) : null}
      {filter === "all" || filter === "drift" ? <RuleDriftCard /> : null}
      {filter === "all" || filter === "dormant" ? <DormantRulesCard /> : null}
    </div>
  );
}
