"use client";

// Forward-looking risk surface. Renders the prioritised list from
// buildRiskWarnings — most severe first. Auto-hides when the list
// is empty (the calm-by-default rule).
// Phase 301 — promoted out of Home into Expenses + made every row
// actionable (tap → open the unified Attention Center sheet for
// approve / dismiss / drill-down). Duplicate warnings (same title)
// are merged so the user never sees the same root cause twice.

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  Eye,
  Info,
  ShieldAlert,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { buildRiskWarnings, type RiskSeverity } from "@/lib/risk-warnings";
import { EASE_OUT_EXPO, STAGGER_TIGHT } from "@/lib/motion-tokens";
import { openAttentionCenter } from "@/lib/use-attention-center";
import { tap as hapticTap } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const TONE: Record<RiskSeverity, string> = {
  alert: "#F87171",
  warn: "#D4AF37",
  watch: "#FCD34D",
  info: "#A1A1AA",
};

function severityIcon(s: RiskSeverity) {
  if (s === "alert") return AlertOctagon;
  if (s === "warn") return AlertTriangle;
  if (s === "watch") return Eye;
  return Info;
}

function suggestedAction(s: RiskSeverity): string {
  if (s === "alert") return "פעל עכשיו — דחה חיוב גדול או הזרם כסף נוסף לחשבון.";
  if (s === "warn") return "קצץ הוצאה משתנה השבוע או בדוק אם אפשר לדחות חיוב.";
  if (s === "watch") return "עקוב אחרי הקצב היומי בימים הקרובים.";
  return "השאר בעין — אין צורך בפעולה מיידית.";
}

export function RiskWarningsCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const entries = useFinanceStore((s) => s.entries);
  const statuses = useFinanceStore((s) => s.statuses);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  const warnings = useMemo(() => {
    if (!hydrated) return [];
    const raw = buildRiskWarnings({
      accounts,
      loans,
      incomes,
      rules,
      entries,
      statuses,
      monthlyBudget,
    });
    // Phase 301 — dedupe by title. Same root cause sometimes
    // surfaces twice (e.g. two cards both hit the income-ratio
    // gate). Keep the most-severe occurrence per title.
    const order: Record<RiskSeverity, number> = {
      alert: 4,
      warn: 3,
      watch: 2,
      info: 1,
    };
    const byTitle = new Map<string, typeof raw[number]>();
    for (const w of raw) {
      const cur = byTitle.get(w.title);
      if (!cur || order[w.severity] > order[cur.severity]) {
        byTitle.set(w.title, w);
      }
    }
    return Array.from(byTitle.values()).sort(
      (a, b) => order[b.severity] - order[a.severity],
    );
  }, [hydrated, accounts, loans, incomes, rules, entries, statuses, monthlyBudget]);

  if (!hydrated || warnings.length === 0) return null;

  return (
    <section className="glass-card flex flex-col gap-2.5 rounded-3xl p-4">
      <header className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <ShieldAlert className="size-3 text-[color:var(--neon)]" />
          סיכוני תזרים
        </span>
        <span className="text-[10px] text-muted-foreground/80">
          {warnings.length} סימנים
        </span>
      </header>

      <ul className="flex flex-col gap-2">
        {warnings.map((w, idx) => {
          const Icon = severityIcon(w.severity);
          const tone = TONE[w.severity];
          return (
            <motion.li
              key={w.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: idx * STAGGER_TIGHT,
                duration: 0.25,
                ease: EASE_OUT_EXPO,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  hapticTap();
                  openAttentionCenter();
                }}
                aria-label={`פתח פעולות עבור: ${w.title}`}
                className="flex w-full items-start gap-2 rounded-2xl border border-white/8 bg-black/25 p-3 text-start transition-colors hover:border-white/16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60"
              >
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: `${tone}22`, color: tone }}
                >
                  <Icon className="size-3.5" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[12px] font-medium text-foreground">
                      {w.title}
                    </span>
                    {typeof w.amount === "number" ? (
                      <span
                        data-mono="true"
                        dir="ltr"
                        className="text-[11px]"
                        style={{ color: tone }}
                      >
                        {ILS.format(w.amount)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                    {w.detail}
                  </p>
                  <p
                    className="mt-1 text-[10px]"
                    style={{ color: tone }}
                  >
                    💡 {suggestedAction(w.severity)}
                  </p>
                </div>
                <ArrowLeft
                  className="mt-1 size-3.5 shrink-0 text-muted-foreground/70"
                  aria-hidden
                />
              </button>
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}
