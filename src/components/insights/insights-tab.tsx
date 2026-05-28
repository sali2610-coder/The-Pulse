"use client";

// Phase 254+255 — "תובנות" tab.
//
// Behavioral / predictive surfaces only. Each card is grounded in
// real engine output — no fake AI. The user reads short Hebrew
// sentences ("בקצב הזה תיכנס לחריגה בעוד 6 ימים"), an explainer
// ("מה זה אומר"), and one suggested action.

import { useMemo, useState } from "react";

import { tap } from "@/lib/haptics";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Lightbulb,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { liquidityCurve } from "@/lib/liquidity-curve";
import { buildRiskWarnings } from "@/lib/risk-warnings";
import { categoryTrends } from "@/lib/forecast";
import { detectSuspectedDuplicates } from "@/lib/dedup";
import { monthKeyOf } from "@/lib/dates";
import { getCategory } from "@/lib/categories";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

type InsightCard = {
  id: string;
  tone: "info" | "warn" | "danger" | "ok";
  icon: React.ReactNode;
  title: string;
  why: string;
  action?: string;
};

function tonePalette(tone: InsightCard["tone"]) {
  if (tone === "danger") return "#F87171";
  if (tone === "warn") return "#F59E0B";
  if (tone === "ok") return "#34D399";
  return "#60A5FA";
}

export function InsightsTab() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  const cards = useMemo<InsightCard[]>(() => {
    if (!hydrated) return [];
    const monthKey = monthKeyOf(new Date());
    const out: InsightCard[] = [];

    // 1. Liquidity-curve dip warning.
    const curve = liquidityCurve({
      accounts,
      loans,
      incomes,
      rules,
      statuses,
      entries,
    });
    if (curve.crossesNegative) {
      const dipDay = curve.lowestPoint.dayIndex;
      out.push({
        id: "liquidity-dip",
        tone: "danger",
        icon: <AlertTriangle className="size-5" />,
        title:
          dipDay === 0
            ? "תזרים שלילי צפוי כבר היום"
            : `תזרים שלילי צפוי בעוד ${dipDay} ימים`,
        why: `הנקודה הנמוכה הצפויה — ${ILS.format(
          Math.round(curve.lowestPoint.balance),
        )}. החישוב לוקח בחשבון משכורות, הלוואות, חיובי כרטיס וקבועים.`,
        action:
          "הקפא חיוב גדול או הזרם כסף לחשבון לפני המועד הזה.",
      });
    }

    // 2. Risk warnings (existing engine — top 2).
    const warnings = buildRiskWarnings({
      accounts,
      loans,
      incomes,
      rules,
      entries,
      statuses,
      monthlyBudget,
      monthKey,
    });
    for (const w of warnings.slice(0, 2)) {
      const tone: InsightCard["tone"] =
        w.severity === "alert"
          ? "danger"
          : w.severity === "warn"
            ? "warn"
            : "info";
      out.push({
        id: `risk-${w.id}`,
        tone,
        icon:
          tone === "danger" ? (
            <AlertTriangle className="size-5" />
          ) : (
            <Info className="size-5" />
          ),
        title: w.title,
        why: w.detail,
        action: undefined,
      });
    }

    // 3. Category trend deltas (top 3 by abs change, threshold 25%).
    const trends = categoryTrends({
      entries,
      monthKey,
      lookback: 3,
    });
    const interesting = trends
      .filter(
        (t) =>
          t.priorAverage > 0 &&
          t.deltaPct !== null &&
          Math.abs(t.deltaPct) >= 0.25 &&
          t.thisMonth > 0,
      )
      .slice(0, 3);
    for (const t of interesting) {
      const meta = getCategory(t.category as ReturnType<typeof getCategory>["id"]);
      const pct = Math.round(Math.abs(t.deltaPct ?? 0) * 100);
      const direction = t.delta > 0 ? "עלו" : "ירדו";
      out.push({
        id: `trend-${t.category}`,
        tone: t.delta > 0 ? "warn" : "ok",
        icon:
          t.delta > 0 ? (
            <TrendingUp className="size-5" />
          ) : (
            <TrendingDown className="size-5" />
          ),
        title: `הוצאות ${meta.label} ${direction} ב-${pct}%`,
        why: `החודש הוצאת ${ILS.format(
          Math.round(t.thisMonth),
        )} לעומת ממוצע 3 חודשים אחרונים של ${ILS.format(
          Math.round(t.priorAverage),
        )}.`,
        action:
          t.delta > 0
            ? "בדוק אילו פריטים תרמו לעלייה לפני סוף החודש."
            : undefined,
      });
    }

    // 4. Suspected duplicates (cap at 1 — surface the strongest).
    const dups = detectSuspectedDuplicates(entries);
    let topDup: {
      score: number;
      ids: [string, string];
    } | null = null;
    for (const [id, info] of dups.entries()) {
      if (!topDup || info.confidence > topDup.score) {
        topDup = { score: info.confidence, ids: [id, info.siblingId] };
      }
    }
    if (topDup) {
      const a = entries.find((e) => e.id === topDup!.ids[0]);
      const b = entries.find((e) => e.id === topDup!.ids[1]);
      if (a && b) {
        out.push({
          id: "dup-suspect",
          tone: "warn",
          icon: <AlertTriangle className="size-5" />,
          title: "ייתכן שיש כפילות בהוצאות שלך",
          why: `שתי הוצאות דומות נראו ב-${new Date(
            a.chargeDate,
          ).toLocaleDateString("he-IL")}: ${a.merchant ?? "ללא שם"} ב-${ILS.format(
            Math.round(a.amount),
          )} ו-${b.merchant ?? "ללא שם"} ב-${ILS.format(Math.round(b.amount))}.`,
          action: "פתח את ההוצאה הכפולה לבדיקה ומחיקה אם צריך.",
        });
      }
    }

    // 5. Pending confirmations.
    const pendingCount = entries.filter(
      (e) => e.needsConfirmation && !e.confirmedAt,
    ).length;
    if (pendingCount > 0) {
      out.push({
        id: "pending",
        tone: "info",
        icon: <Sparkles className="size-5" />,
        title:
          pendingCount === 1
            ? "חיוב אחד ממתין לאישור"
            : `${pendingCount} חיובים ממתינים לאישור`,
        why: "פעולות שעדיין מחכות לאישור סופי מהמשתמש. עד שלא יאושרו, הן לא נכנסות לתחזית הסופית.",
        action: "פתח את לוח הבית — Pending Tray ממתין למעלה.",
      });
    }

    // 6. Calm fallback when nothing else fires.
    if (out.length === 0) {
      out.push({
        id: "ok",
        tone: "ok",
        icon: <CheckCircle2 className="size-5" />,
        title: "הכל תחת שליטה",
        why: "אין סיכונים תזרימיים בולטים לחודש הקרוב. המשך כך.",
      });
    }

    return out;
  }, [
    hydrated,
    accounts,
    loans,
    incomes,
    rules,
    statuses,
    entries,
    monthlyBudget,
  ]);

  return <InsightsTabInner cards={cards} />;
}

function InsightsTabInner({ cards }: { cards: InsightCard[] }) {
  // Phase 260 — quick filter chips. Match the preset model from
  // CategorySpendCard so the user can switch tone class without
  // scrolling. Count per tone is computed once for badge text.
  type Filter = "all" | "danger" | "warn" | "info" | "ok";
  const [filter, setFilter] = useState<Filter>("all");
  const filtered =
    filter === "all" ? cards : cards.filter((c) => c.tone === filter);
  const presets: Array<{ key: Filter; label: string }> = [
    { key: "all", label: `הכל (${cards.length})` },
    {
      key: "danger",
      label: `סיכון (${cards.filter((c) => c.tone === "danger").length})`,
    },
    {
      key: "warn",
      label: `אזהרה (${cards.filter((c) => c.tone === "warn").length})`,
    },
    {
      key: "info",
      label: `מגמות (${cards.filter((c) => c.tone === "info").length})`,
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-5 pb-28 sm:grid-cols-6 sm:gap-5 sm:pb-32">
      <div className="sm:col-span-6 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="size-4 text-[color:var(--neon)]" />
          <span className="text-section text-foreground">תובנות חכמות</span>
        </div>
        <p className="text-caption text-muted-foreground">
          Pulse קורא את הנתונים שלך ומדגיש את הדברים שצריך לשים אליהם
          לב. כל תובנה כאן נשענת על חישוב אמיתי — לא ניחושים.
        </p>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => {
            const active = filter === p.key;
            return (
              <button
                key={p.key}
                type="button"
                data-no-min-tap
                onClick={() => {
                  tap();
                  setFilter(p.key);
                }}
                className={`text-caption rounded-full px-3 py-1.5 transition-colors ${
                  active
                    ? "bg-[color:var(--neon)]/25 text-[color:var(--neon)]"
                    : "border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="sm:col-span-6 text-caption text-muted-foreground/85">
          אין תובנות בקטגוריה הזו כרגע.
        </p>
      ) : null}

      {filtered.map((c) => {
        const color = tonePalette(c.tone);
        return (
          <section
            key={c.id}
            className="glass-card sm:col-span-6 flex items-start gap-3 rounded-3xl p-5"
            style={{
              background: `linear-gradient(135deg, ${color}12 0%, transparent 65%)`,
            }}
          >
            <span
              className="flex size-11 shrink-0 items-center justify-center rounded-2xl"
              style={{ background: `${color}22`, color }}
            >
              {c.icon}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-section" style={{ color }}>
                {c.title}
              </span>
              <span className="text-body text-muted-foreground/90">
                {c.why}
              </span>
              {c.action ? (
                <span className="text-caption text-foreground/85">
                  💡 {c.action}
                </span>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
