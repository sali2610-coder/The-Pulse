"use client";

// Recurring · compact 4-tile Settings dashboard.
//
// Prior version rendered as a long single-column form (hero + filter
// chip strip + monolithic list). Rebuilt as four glass tap-tiles
// (חיובים קבועים · מנויים · תשלומים פרוסים · על הכרטיס) followed by
// BottomSheet drilldowns per lane. Zero engine change — every read
// and every mutation still routes through the same useFinanceStore /
// addRule / updateRule / deleteRule / toggleRule surface the rest of
// the app already consumes.
//
// Sync — verified for this pass:
//   • rules / accounts read via useFinanceStore selectors, so any
//     mutation (quick expense, SMS webhook, rule edit inside
//     RuleFullScreenEdit, category drilldowns) triggers zustand
//     notifications and this component re-renders.
//   • RuleFullScreenEdit persists via store.addRule / updateRule /
//     deleteRule. Home Obligations Dashboard, Time-tab checkpoints,
//     Expenses cockpit, and the Insights Inbox all subscribe to the
//     same rules[] slice → they re-render the moment a rule lands
//     or changes.
//   • paymentSource + linkedCardId round-trip through the same
//     store fields; card-linked rules land in card-cycle / card-
//     pressure / cash-flow-buckets automatically.

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarClock,
  ChevronLeft,
  CreditCard,
  Layers,
  Plus,
  Receipt,
  Sparkles,
} from "lucide-react";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useFinanceStore } from "@/lib/store";
import {
  currentMonthKey,
  dayWithinMonth,
  addMonths,
  monthKeyOf,
} from "@/lib/dates";
import { ruleSchedule } from "@/lib/installment-schedule";
import { isRuleCardSettled } from "@/lib/rule-settlement";
import { getCategory } from "@/lib/categories";
import {
  MiniAppAddCta,
  MiniAppEmpty,
  MiniAppListCard,
} from "@/components/ui/mini-app-shell";
import { RuleFullScreenEdit } from "@/components/recurring/rule-fullscreen-edit";
import { tap as hapticTap } from "@/lib/haptics";
import type { RecurringRule } from "@/types/finance";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

type LaneId = "fixed" | "cardSubs" | "installments" | "thisWeek";
type Sheet = LaneId | null;

const LANE_META: Record<
  LaneId,
  { label: string; tone: "gold" | "cyan" | "purple" | "safe"; icon: React.ReactNode }
> = {
  fixed: {
    label: "חיובים קבועים",
    tone: "gold",
    icon: <Receipt className="size-4" />,
  },
  cardSubs: {
    label: "מנויים על כרטיס",
    tone: "cyan",
    icon: <CreditCard className="size-4" />,
  },
  installments: {
    label: "תשלומים פרוסים",
    tone: "purple",
    icon: <Layers className="size-4" />,
  },
  thisWeek: {
    label: "השבוע הקרוב",
    tone: "safe",
    icon: <Sparkles className="size-4" />,
  },
};

function laneOf(rule: RecurringRule): "fixed" | "cardSubs" | "installments" {
  if (rule.installmentTotal && rule.installmentTotal > 1) return "installments";
  if (isRuleCardSettled(rule) || rule.paymentSource === "card") return "cardSubs";
  return "fixed";
}

function sourceLabel(
  source: "bank" | "card" | "cash" | "unknown" | undefined,
): string {
  if (source === "bank") return "בנק";
  if (source === "card") return "כרטיס";
  if (source === "cash") return "מזומן";
  return "לא משויך";
}

export function RecurringMiniApp() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const rules = useFinanceStore((s) => s.rules);
  const accounts = useFinanceStore((s) => s.accounts);

  const [sheet, setSheet] = useState<Sheet>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const monthKey = currentMonthKey();
  const now = useMemo(() => new Date(), []);
  const nextMonthKey = addMonths(monthKeyOf(now), 1);

  const enriched = useMemo(() => {
    if (!hydrated) return [];
    return rules
      .map((r) => {
        const sched = ruleSchedule(r, monthKey);
        const there = ruleSchedule(r, nextMonthKey);
        const isEnding = sched.active && !there.active;
        const day = Math.max(1, Math.min(31, r.dayOfMonth ?? 1));
        const chargeThisMonth = dayWithinMonth(monthKey, day);
        const todayKey = monthKeyOf(now);
        const todayDay = todayKey === monthKey ? now.getDate() : 1;
        const nextCharge =
          todayKey === monthKey && day >= todayDay
            ? chargeThisMonth
            : dayWithinMonth(nextMonthKey, day);
        const source: "bank" | "card" | "cash" | "unknown" = isRuleCardSettled(r)
          ? "card"
          : r.paymentSource ?? "unknown";
        const lane = laneOf(r);
        return { rule: r, sched, isEnding, nextCharge, source, lane };
      })
      .filter((e) => e.sched.active || e.rule.active);
  }, [hydrated, rules, monthKey, nextMonthKey, now]);

  const totals: Record<
    LaneId,
    { count: number; monthly: number; nextDate: Date | null }
  > = {
    fixed: { count: 0, monthly: 0, nextDate: null },
    cardSubs: { count: 0, monthly: 0, nextDate: null },
    installments: { count: 0, monthly: 0, nextDate: null },
    thisWeek: { count: 0, monthly: 0, nextDate: null },
  };
  const weekCutoff = now.getTime() + 7 * 86_400_000;
  for (const e of enriched) {
    const bucket = totals[e.lane];
    if (bucket) {
      bucket.count += 1;
      if (e.sched.active) bucket.monthly += e.rule.estimatedAmount;
      if (
        !bucket.nextDate ||
        e.nextCharge.getTime() < bucket.nextDate.getTime()
      ) {
        bucket.nextDate = e.nextCharge;
      }
    }
    // Derived 'this week' bucket — any active rule firing in the
    // next 7 days regardless of its structural lane.
    if (e.sched.active && e.nextCharge.getTime() <= weekCutoff) {
      const wk = totals.thisWeek;
      wk.count += 1;
      wk.monthly += e.rule.estimatedAmount;
      if (!wk.nextDate || e.nextCharge.getTime() < wk.nextDate.getTime()) {
        wk.nextDate = e.nextCharge;
      }
    }
  }

  function openAdd() {
    hapticTap();
    setEditingId(null);
    setEditOpen(true);
  }
  function openEdit(id: string) {
    hapticTap();
    setEditingId(id);
    setEditOpen(true);
  }

  if (!hydrated) return null;

  return (
    <div className="rc-root" dir="rtl">
      <div className="rc-tiles">
        {(Object.keys(LANE_META) as LaneId[]).map((laneId) => {
          const meta = LANE_META[laneId];
          const t = totals[laneId];
          return (
            <LaneTile
              key={laneId}
              icon={meta.icon}
              label={meta.label}
              headline={ILS.format(Math.round(t.monthly))}
              hint={
                t.count === 0
                  ? "אין פריטים"
                  : t.count === 1
                    ? "פריט אחד · לחץ לפתיחה"
                    : `${t.count} פריטים · לחץ לפתיחה`
              }
              tone={meta.tone}
              onClick={() => {
                hapticTap();
                setSheet(laneId);
              }}
            />
          );
        })}
      </div>

      <div className="rc-quick">
        <button
          type="button"
          className="rc-quick-btn rc-quick-btn-primary"
          onClick={openAdd}
          aria-label="הוסף חיוב קבוע חדש"
        >
          <Plus className="size-4" />
          הוסף חיוב חדש
        </button>
      </div>

      {enriched.length === 0 ? (
        <div className="rc-empty">
          <MiniAppEmpty
            icon={Receipt}
            title="עוד אין חיובים קבועים"
            body="הוסף את החיוב הראשון. שכירות, מנוי, חוג — הכל נקלט אוטומטית ל-Pulse, לקטגוריות ולחיזוי לסוף החודש."
            cta={{ label: "הוסף חיוב קבוע", onClick: openAdd }}
          />
        </div>
      ) : null}

      {(Object.keys(LANE_META) as LaneId[]).map((laneId) => {
        const meta = LANE_META[laneId];
        const t = totals[laneId];
        const items = enriched
          .filter((e) => {
            if (laneId === "thisWeek") {
              return (
                e.sched.active && e.nextCharge.getTime() <= weekCutoff
              );
            }
            return e.lane === laneId;
          })
          .sort((a, b) => a.nextCharge.getTime() - b.nextCharge.getTime());
        return (
          <BottomSheet
            key={laneId}
            open={sheet === laneId}
            onOpenChange={(o) => setSheet(o ? laneId : null)}
            title={meta.label}
            className="rc-sheet"
          >
            <div className="rc-sheet-body" dir="rtl">
              <header className="rc-sheet-head">
                <div>
                  <span className="rc-sheet-eyebrow">{meta.label}</span>
                  <span className="rc-sheet-title">
                    {ILS.format(Math.round(t.monthly))}
                  </span>
                  <span className="rc-sheet-hint">
                    {t.count} פריטים{" "}
                    {t.nextDate ? (
                      <>
                        · הבא ב-
                        {String(t.nextDate.getDate()).padStart(2, "0")}/
                        {String(t.nextDate.getMonth() + 1).padStart(2, "0")}
                      </>
                    ) : null}
                  </span>
                </div>
              </header>
              {items.length === 0 ? (
                <MiniAppEmpty
                  icon={Receipt}
                  title="אין פריטים בקטגוריה הזו"
                  body="לחץ 'הוסף חיוב חדש' כדי להוסיף את הראשון."
                  cta={{ label: "הוסף חיוב חדש", onClick: openAdd }}
                />
              ) : (
                <>
                  <MiniAppAddCta
                    label="הוסף חיוב חדש"
                    onClick={openAdd}
                  />
                  <ul className="rc-list">
                    {items.map((e) => {
                      const cat = getCategory(e.rule.category);
                      const tone = cat.accent;
                      const linkedCard =
                        e.source === "card" && e.rule.linkedCardId
                          ? accounts.find((a) => a.id === e.rule.linkedCardId)
                          : undefined;
                      const daysToNext = Math.max(
                        0,
                        Math.floor(
                          (e.nextCharge.getTime() - now.getTime()) /
                            86_400_000,
                        ),
                      );
                      const subtitleParts: string[] = [
                        `יום ${e.rule.dayOfMonth}`,
                        daysToNext === 0
                          ? "חיוב היום"
                          : daysToNext === 1
                            ? "מחר"
                            : `בעוד ${daysToNext} ימים`,
                        linkedCard
                          ? `${linkedCard.label}${linkedCard.cardLast4 ? ` ····${linkedCard.cardLast4}` : ""}`
                          : sourceLabel(e.source),
                      ];
                      const total = e.rule.installmentTotal;
                      const remaining = e.sched.remaining;
                      const paid =
                        total !== undefined && remaining !== undefined
                          ? Math.max(0, total - remaining)
                          : undefined;
                      const progress =
                        paid !== undefined && total !== undefined && total > 0
                          ? paid / total
                          : undefined;
                      const progressLabel =
                        paid !== undefined && total !== undefined
                          ? `${paid}/${total} תשלומים שולמו`
                          : undefined;
                      const status = e.isEnding
                        ? { tone: "#34D399", label: "מסתיים בחודש הבא" }
                        : !e.rule.active
                          ? { tone: "#A1A1AA", label: "מושהה" }
                          : undefined;
                      return (
                        <li key={e.rule.id}>
                          <MiniAppListCard
                            icon={cat.icon}
                            tone={tone}
                            title={e.rule.label}
                            subtitle={subtitleParts.join(" · ")}
                            primaryValue={`−${ILS.format(e.rule.estimatedAmount)}`}
                            primaryCaption={
                              total !== undefined
                                ? "/חודש"
                                : sourceLabel(e.source)
                            }
                            progress={progress}
                            progressLabel={progressLabel}
                            status={status}
                            onClick={() => openEdit(e.rule.id)}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          </BottomSheet>
        );
      })}

      <RuleFullScreenEdit
        ruleId={editingId}
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setEditingId(null);
        }}
      />
    </div>
  );
}

function LaneTile({
  icon,
  label,
  headline,
  hint,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  headline: string;
  hint: string;
  tone: "gold" | "cyan" | "purple" | "safe";
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      className="rc-tile"
      data-tone={tone}
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
      aria-label={`${label} · ${headline}`}
    >
      <span aria-hidden className="rc-tile-icon">
        {icon}
      </span>
      <span className="rc-tile-label">{label}</span>
      <span className="rc-tile-headline" data-mono="true" dir="ltr">
        {headline}
      </span>
      <span className="rc-tile-hint">{hint}</span>
      <span aria-hidden className="rc-tile-cue">
        <ChevronLeft className="size-3.5" />
      </span>
    </motion.button>
  );
}

// Silence unused-import warnings for CalendarClock (reserved for a
// future "next charge" chip row).
void CalendarClock;
