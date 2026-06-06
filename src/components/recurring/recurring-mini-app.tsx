"use client";

// Phase 413 — Recurring expenses & subscriptions as a mini-app.
//
// Hero: monthly total this month + next charge + count of active
// rules. Single flat list (sorted by next-charge-date), filterable
// by source chip. Each card shows category icon, label, amount,
// next-charge countdown, installment progress when applicable,
// source badge. Tap → RuleFullScreenEdit.

import { useMemo, useState } from "react";
import { Receipt } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey, dayWithinMonth, addMonths, monthKeyOf } from "@/lib/dates";
import { ruleSchedule } from "@/lib/installment-schedule";
import { isRuleCardSettled } from "@/lib/rule-settlement";
import { getCategory } from "@/lib/categories";
import {
  MiniAppAddCta,
  MiniAppEmpty,
  MiniAppHero,
  MiniAppListCard,
  MiniAppSectionLabel,
  type MiniAppKpi,
} from "@/components/ui/mini-app-shell";
import { RuleFullScreenEdit } from "@/components/recurring/rule-fullscreen-edit";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

type Filter = "all" | "bank" | "card" | "cash" | "installment" | "ending";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "הכל" },
  { id: "bank", label: "בנק" },
  { id: "card", label: "כרטיס" },
  { id: "cash", label: "מזומן" },
  { id: "installment", label: "תשלומים" },
  { id: "ending", label: "מסתיים" },
];

function sourceTone(source: string): string {
  if (source === "bank") return "#FACC15";
  if (source === "card") return "#75F5FF";
  if (source === "cash") return "#34D399";
  return "#A1A1AA";
}

function sourceLabel(source: string): string {
  if (source === "bank") return "בנק";
  if (source === "card") return "כרטיס";
  if (source === "cash") return "מזומן";
  return "לא משויך";
}

export function RecurringMiniApp() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const rules = useFinanceStore((s) => s.rules);
  const accounts = useFinanceStore((s) => s.accounts);

  const [filter, setFilter] = useState<Filter>("all");
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
        const here = ruleSchedule(r, monthKey);
        const there = ruleSchedule(r, nextMonthKey);
        const isEnding = here.active && !there.active;
        const day = Math.max(1, Math.min(31, r.dayOfMonth ?? 1));
        const chargeThisMonth = dayWithinMonth(monthKey, day);
        const todayKey = monthKeyOf(now);
        const todayDay = todayKey === monthKey ? now.getDate() : 1;
        const nextCharge =
          todayKey === monthKey && day >= todayDay
            ? chargeThisMonth
            : dayWithinMonth(nextMonthKey, day);
        const source = isRuleCardSettled(r)
          ? "card"
          : r.paymentSource ?? "unknown";
        return {
          rule: r,
          sched,
          isEnding,
          nextCharge,
          source,
        };
      })
      .filter((e) => e.sched.active || e.rule.active);
  }, [hydrated, rules, monthKey, nextMonthKey, now]);

  const visible = enriched
    .filter((e) => {
      if (filter === "all") return true;
      if (filter === "ending") return e.isEnding;
      if (filter === "installment") return !!e.rule.installmentTotal;
      if (filter === "bank") return e.source === "bank";
      if (filter === "card") return e.source === "card";
      if (filter === "cash") return e.source === "cash";
      return true;
    })
    .sort((a, b) => a.nextCharge.getTime() - b.nextCharge.getTime());

  const monthlyTotal = enriched.reduce(
    (s, e) => s + (e.sched.active ? e.rule.estimatedAmount : 0),
    0,
  );
  const activeCount = enriched.filter((e) => e.sched.active).length;
  const nextOne = visible[0];

  const kpis: MiniAppKpi[] = [
    {
      label: "סה״כ החודש",
      value: ILS.format(monthlyTotal),
      tone: "#D4AF37",
      emphasis: true,
      caption:
        activeCount === 0
          ? "אין חיובים פעילים"
          : activeCount === 1
            ? "חיוב אחד פעיל"
            : `${activeCount} חיובים פעילים`,
    },
    {
      label: "החיוב הבא",
      value: nextOne
        ? ILS.format(nextOne.rule.estimatedAmount)
        : "—",
      tone: "#A78BFA",
      caption: nextOne ? nextOne.rule.label : undefined,
    },
  ];

  function openAdd() {
    setEditingId(null);
    setEditOpen(true);
  }
  function openEdit(id: string) {
    setEditingId(id);
    setEditOpen(true);
  }

  return (
    <div className="flex flex-col gap-3" dir="rtl">
      <MiniAppHero
        title="חיובים קבועים ומנויים"
        subtitle="כל חיוב חוזר, ממוין לפי החודש הקרוב."
        kpis={kpis}
      />

      {enriched.length === 0 ? (
        <MiniAppEmpty
          icon={Receipt}
          title="עוד אין חיובים קבועים"
          body="הוסף את החיוב הראשון. שכירות, מנוי, חוג — הכל נקלט אוטומטית ל-Pulse, לקטגוריות ולחיזוי לסוף החודש."
          cta={{ label: "הוסף חיוב קבוע", onClick: openAdd }}
        />
      ) : (
        <>
          <MiniAppAddCta label="הוסף חיוב קבוע" onClick={openAdd} />

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

          {visible.length === 0 ? (
            <p className="rounded-2xl border border-white/8 bg-black/25 p-6 text-center text-[12px] text-muted-foreground">
              אין חיובים בסינון הזה.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {visible.map((e) => {
                const cat = getCategory(e.rule.category);
                const tone = cat.accent;
                const linkedCard =
                  e.source === "card" && e.rule.linkedCardId
                    ? accounts.find((a) => a.id === e.rule.linkedCardId)
                    : undefined;
                const daysToNext = Math.max(
                  0,
                  Math.floor(
                    (e.nextCharge.getTime() - now.getTime()) / 86_400_000,
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
                        total !== undefined ? "/חודש" : sourceLabel(e.source)
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
          )}
        </>
      )}

      {enriched.some((e) => e.isEnding) ? (
        <MiniAppSectionLabel>מסתיימים בחודש הבא</MiniAppSectionLabel>
      ) : null}

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
