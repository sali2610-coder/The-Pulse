"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  ArrowDownToLine,
  Banknote,
  CheckCircle2,
  Receipt,
  Sparkles,
  Wallet,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { EASE_OUT_EXPO, STAGGER_TIGHT } from "@/lib/motion-tokens";

type Step = {
  id: string;
  icon: typeof Wallet;
  title: string;
  description: string;
  done: boolean;
  /** Hash anchor on the settings tab — tab switcher honors `#section` */
  href: string;
};

/**
 * Calm onboarding card. Renders ONLY when the workspace is missing
 * fundamental setup pieces. Once each piece is configured the row
 * dims to a checkmark; once ALL are configured the card disappears
 * entirely.
 *
 * No modals, no wizards — surfaces the missing steps inline, links
 * straight to Settings.
 */
export function WelcomeSetupCard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);
  // Phase 266 — Auto budgetMode is a fully valid setup. The user
  // doesn't need to type a monthlyBudget number; the engine derives
  // it from liquidity. Without this guard the onboarding card
  // nagged Auto users to "set a budget" forever.
  const budgetMode = useFinanceStore((s) => s.budgetMode);

  const steps = useMemo<Step[]>(() => {
    const hasBank = accounts.some(
      (a) => a.kind === "bank" && a.active && a.anchorBalance !== undefined,
    );
    const hasIncome = incomes.some((i) => i.active);
    const hasRecurring = rules.some((r) => r.active);
    const hasBudget = budgetMode === "auto" || monthlyBudget > 0;
    return [
      {
        id: "bank",
        icon: Wallet,
        title: "חשבון בנק עם יתרה",
        description: "מאפשר ל-Pulse לדעת איפה היתרה שלך עומדת היום.",
        done: hasBank,
        href: "settings",
      },
      {
        id: "income",
        icon: ArrowDownToLine,
        title: "משכורת חודשית",
        description: "מזריקה הכנסה ביום שתגדיר ומאזנת תחזית.",
        done: hasIncome,
        href: "settings",
      },
      {
        id: "budget",
        icon: Banknote,
        title: "תקציב חודשי",
        description: "קובע את היעד שלפיו Pulse מודד מצב.",
        done: hasBudget,
        href: "settings",
      },
      {
        id: "recurring",
        icon: Receipt,
        title: "הוצאות קבועות",
        description: "ועד-בית, חשמל, מנויים — מציירים את התזרים החודשי.",
        done: hasRecurring,
        href: "settings",
      },
    ];
  }, [accounts, incomes, rules, monthlyBudget, budgetMode]);

  if (!hydrated) return null;
  const remaining = steps.filter((s) => !s.done);
  if (remaining.length === 0) return null;

  return (
    <section className="glass-card flex flex-col gap-3 rounded-3xl p-4">
      <header className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-full bg-gold/15 text-gold">
          <Sparkles className="size-3.5" strokeWidth={1.8} />
        </span>
        <div className="flex flex-col leading-tight">
          <h3 className="text-[13px] font-medium text-foreground">
            כיול ראשוני של Pulse
          </h3>
          <span className="text-[10px] text-muted-foreground">
            {remaining.length} שלבים פתוחים · {steps.length - remaining.length} הושלמו
          </span>
        </div>
      </header>

      <ul className="flex flex-col gap-1.5">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          return (
            <motion.li
              key={step.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: idx * STAGGER_TIGHT,
                duration: 0.3,
                ease: EASE_OUT_EXPO,
              }}
              className={`flex items-start gap-2.5 rounded-2xl border p-2.5 transition-colors ${
                step.done
                  ? "border-[#34D399]/20 bg-[#34D399]/[0.05] opacity-70"
                  : "border-white/8 bg-black/25"
              }`}
            >
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-xl ${
                  step.done
                    ? "bg-[#34D399]/14 text-[#34D399]"
                    : "bg-[color:var(--neon)]/12 text-[color:var(--neon)]"
                }`}
              >
                {step.done ? (
                  <CheckCircle2 className="size-4" strokeWidth={1.8} />
                ) : (
                  <Icon className="size-4" strokeWidth={1.8} />
                )}
              </span>
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="text-[12.5px] font-medium text-foreground">
                  {step.title}
                </span>
                <span className="text-[10.5px] text-muted-foreground">
                  {step.description}
                </span>
              </div>
            </motion.li>
          );
        })}
      </ul>

      <p className="text-center text-[10px] text-muted-foreground/80">
        ניתן להגדיר את כל אלה בטאב{" "}
        <span className="text-foreground/90">הגדרות</span>. הכל אופציונלי —
        מה שתגדיר נכנס מיד למנוע התחזית.
      </p>
    </section>
  );
}
