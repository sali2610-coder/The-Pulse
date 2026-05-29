"use client";

// Phase 294 — Attention Center bottom sheet.
//
// Single destination for every "this needs your eyes" signal the
// Home tab surfaces (the yellow badge on the bottom-nav tab, the
// bell chip on TodayPulseCard, a future status-bar entry). Pulls
// from the existing engines — no fake alerts — and groups them
// into three sections:
//
//   • לאישור     — entries with needsConfirmation && !confirmedAt.
//                   The user must accept / categorize each.
//   • סיכונים    — top AI insights of group "risk" from
//                   gatherAiInsights().
//   • לבדיקה     — recurring-section insightItems (drift / dormant /
//                   subscription / endingSoon) from
//                   buildRecurringSectionSummary().
//
// Tapping a row deep-links into the right tab via navigateToTab()
// (which also auto-scrolls to the section data-attribute when
// provided). Closes the sheet so the destination is what the user
// sees next.

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarCheck,
  Check,
  CheckCircle2,
  CreditCard,
  Lightbulb,
  ListChecks,
  Receipt,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import {
  useAttentionCenter,
  closeAttentionCenter,
} from "@/lib/use-attention-center";
import { gatherAiInsights } from "@/lib/ai-insights";
import { buildRecurringSectionSummary } from "@/lib/recurring-section-summary";
import { navigateToTab, type TabId } from "@/lib/tab-nav";
import { tap as hapticTap, success as hapticSuccess } from "@/lib/haptics";
import {
  dismissInsight,
  type DetectorKind,
} from "@/lib/insight-dismiss";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

type AttentionItem = {
  id: string;
  group: "confirm" | "risk" | "review";
  title: string;
  detail?: string;
  tone: string;
  icon: React.ReactNode;
  goTo: TabId;
  section?: string;
  /** Confirm group only — the underlying ExpenseEntry id so the
   *  inline approve / delete chips can call the store directly. */
  entryId?: string;
  /** Review group only — maps the recurring-summary item kind to a
   *  DetectorKind + a stable targetId for the 7-day dismissal. */
  dismissKey?: { kind: DetectorKind; targetId: string };
};

const GROUP_LABEL: Record<AttentionItem["group"], string> = {
  confirm: "ממתינים לאישור",
  risk: "סיכונים פעילים",
  review: "פריטים לבדיקה",
};

const GROUP_TONE: Record<AttentionItem["group"], string> = {
  confirm: "#FBBF24",
  risk: "#F87171",
  review: "#60A5FA",
};

export function AttentionCenter() {
  const { open, setOpen } = useAttentionCenter();
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);

  const items = useMemo<AttentionItem[]>(() => {
    if (!hydrated) return [];
    const monthKey = currentMonthKey();
    const out: AttentionItem[] = [];

    // 1. Pending confirmations — strongest urgency.
    for (const e of entries) {
      if (!e.needsConfirmation || e.confirmedAt) continue;
      out.push({
        id: `confirm:${e.id}`,
        group: "confirm",
        title: e.merchant || e.note || "חיוב ממתין לאישור",
        detail: `${ILS.format(Math.round(Math.abs(e.amount)))} · נדרש זיהוי קטגוריה`,
        tone: "#FBBF24",
        icon: <Receipt className="size-3.5" />,
        goTo: "dashboard",
        entryId: e.id,
      });
    }

    // 2. AI risk insights — top 3.
    const ai = gatherAiInsights({
      entries,
      rules,
      statuses,
      accounts,
      loans,
      incomes,
      monthlyBudget,
      monthKey,
    });
    for (const ins of ai.byGroup.risk.slice(0, 3)) {
      out.push({
        id: `risk:${ins.id}`,
        group: "risk",
        title: ins.title,
        detail: ins.body,
        tone: "#F87171",
        icon: <AlertTriangle className="size-3.5" />,
        goTo: "setup",
      });
    }

    // 3. Recurring-section review items — drift / dormant / subscription /
    //    endingSoon. Top 3.
    const recurring = buildRecurringSectionSummary({
      entries,
      rules,
      statuses,
      monthKey,
    });
    for (const it of recurring.insightItems.slice(0, 3)) {
      // Map insight kind → DetectorKind for inline 7-day dismissal.
      // endingSoon is a positive signal — no dismissal exposed.
      let dismissKey: { kind: DetectorKind; targetId: string } | undefined;
      if (it.kind === "drift") {
        const ruleId = it.id.replace(/^drift:/, "");
        dismissKey = { kind: "rule-drift", targetId: ruleId };
      } else if (it.kind === "dormant") {
        const ruleId = it.id.replace(/^dormant:/, "");
        dismissKey = { kind: "dormant-rule", targetId: ruleId };
      } else if (it.kind === "subscription") {
        const merchantKey = it.id.replace(/^subscription:/, "");
        dismissKey = { kind: "subscription", targetId: merchantKey };
      }
      out.push({
        id: `review:${it.id}`,
        group: "review",
        title: it.label,
        detail: it.detail,
        tone: "#60A5FA",
        icon:
          it.kind === "endingSoon" ? (
            <CalendarCheck className="size-3.5" />
          ) : it.kind === "subscription" ? (
            <CreditCard className="size-3.5" />
          ) : it.kind === "drift" ? (
            <Sparkles className="size-3.5" />
          ) : (
            <ListChecks className="size-3.5" />
          ),
        goTo: "analytics",
        section: "expenses-recurring",
        dismissKey,
      });
    }

    return out;
  }, [
    hydrated,
    entries,
    rules,
    statuses,
    accounts,
    loans,
    incomes,
    monthlyBudget,
  ]);

  const grouped = useMemo(() => {
    const map: Record<AttentionItem["group"], AttentionItem[]> = {
      confirm: [],
      risk: [],
      review: [],
    };
    for (const it of items) map[it.group].push(it);
    return map;
  }, [items]);

  const confirmExpense = useFinanceStore((s) => s.confirmExpense);
  const dismissPending = useFinanceStore((s) => s.dismissPending);

  function handleOpen(it: AttentionItem) {
    hapticTap();
    closeAttentionCenter();
    navigateToTab(it.goTo, it.section);
  }

  function handleApprove(it: AttentionItem) {
    if (!it.entryId) return;
    hapticSuccess();
    // Confirm without any patch — keeps the existing category /
    // amount / merchant. The user can still edit via the "פתח" action
    // if anything needs correction.
    confirmExpense(it.entryId, {});
  }

  function handleDelete(it: AttentionItem) {
    if (!it.entryId) return;
    hapticTap();
    dismissPending(it.entryId);
  }

  function handleDismiss(it: AttentionItem) {
    if (!it.dismissKey) return;
    hapticTap();
    dismissInsight(it.dismissKey.kind, it.dismissKey.targetId);
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={setOpen}
      title="מרכז תשומת הלב"
      className="gap-3"
    >
      <header className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-[#FBBF24]/15 text-[#FBBF24]">
            <Lightbulb className="size-4" />
          </span>
          <span className="text-section text-foreground">מרכז תשומת הלב</span>
        </div>
        <span className="text-caption text-muted-foreground">
          {items.length} פריטים
        </span>
      </header>

      <p className="text-caption text-muted-foreground">
        כל התרעה כאן מבוססת על חישוב אמיתי מהמנוע — לא ניחושים. הקש על פריט
        כדי לפתוח את המסך שמטפל בו.
      </p>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/8 bg-black/25 p-6 text-center">
          <CheckCircle2 className="size-7 text-[#34D399]" />
          <span className="text-section text-foreground">הכל תחת שליטה</span>
          <span className="text-caption text-muted-foreground/85">
            אין כרגע פריטים שדורשים תשומת לב. Pulse ימשיך לעקוב.
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {(["confirm", "risk", "review"] as const).map((g) => {
            const list = grouped[g];
            if (list.length === 0) return null;
            const tone = GROUP_TONE[g];
            return (
              <section
                key={g}
                className="flex flex-col gap-1.5"
                aria-label={GROUP_LABEL[g]}
              >
                <header className="flex items-center justify-between">
                  <span className="text-caption font-medium" style={{ color: tone }}>
                    {GROUP_LABEL[g]}
                  </span>
                  <span
                    className="text-micro rounded-full border px-2 py-0.5"
                    style={{ color: tone, borderColor: `${tone}44` }}
                  >
                    {list.length}
                  </span>
                </header>
                <ul className="flex flex-col gap-1.5">
                  <AnimatePresence initial={false}>
                    {list.map((it, idx) => (
                      <motion.li
                        key={it.id}
                        layout
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, height: 0, marginTop: 0 }}
                        transition={{
                          delay: Math.min(idx * 0.04, 0.25),
                          duration: 0.22,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        className="flex flex-col gap-2 rounded-2xl border border-white/8 bg-black/25 p-3 text-start"
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md"
                            style={{
                              background: `${it.tone}22`,
                              color: it.tone,
                            }}
                          >
                            {it.icon}
                          </span>
                          <div className="flex min-w-0 flex-1 flex-col leading-tight">
                            <span className="text-body text-foreground">
                              {it.title}
                            </span>
                            {it.detail ? (
                              <span className="text-caption text-muted-foreground/85">
                                {it.detail}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <ActionRow
                          item={it}
                          onOpen={() => handleOpen(it)}
                          onApprove={() => handleApprove(it)}
                          onDelete={() => handleDelete(it)}
                          onDismiss={() => handleDismiss(it)}
                        />
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </BottomSheet>
  );
}

/** Read-only count for badges. Same engine as the sheet content
 *  so a "4" on the tab always matches the number of cards shown. */
function ActionRow({
  item,
  onOpen,
  onApprove,
  onDelete,
  onDismiss,
}: {
  item: AttentionItem;
  onOpen: () => void;
  onApprove: () => void;
  onDelete: () => void;
  onDismiss: () => void;
}) {
  if (item.group === "confirm") {
    return (
      <div className="flex items-center gap-1.5 pt-1">
        <ActionChip
          tone="#34D399"
          icon={<Check className="size-3" />}
          label="אישור"
          onClick={onApprove}
          aria="אשר את החיוב כפי שהוא"
        />
        <ActionChip
          tone="#60A5FA"
          icon={<ArrowLeft className="size-3" />}
          label="פתח"
          onClick={onOpen}
          aria="פתח את מסך האישור עם עריכה מלאה"
        />
        <div className="ms-auto">
          <ActionChip
            tone="#F87171"
            icon={<Trash2 className="size-3" />}
            label="מחק"
            onClick={onDelete}
            aria="מחק את החיוב הממתין"
          />
        </div>
      </div>
    );
  }

  if (item.group === "risk") {
    return (
      <div className="flex items-center gap-1.5 pt-1">
        <ActionChip
          tone="#FBBF24"
          icon={<Lightbulb className="size-3" />}
          label="פתח פירוט"
          onClick={onOpen}
          aria="פתח את פירוט הסיכון בתובנות AI"
        />
      </div>
    );
  }

  // review
  return (
    <div className="flex items-center gap-1.5 pt-1">
      <ActionChip
        tone="#60A5FA"
        icon={<ArrowLeft className="size-3" />}
        label="פתח"
        onClick={onOpen}
        aria="פתח את המסך הקשור"
      />
      {item.dismissKey ? (
        <div className="ms-auto">
          <ActionChip
            tone="#A1A1AA"
            icon={<XCircle className="size-3" />}
            label="התעלם"
            onClick={onDismiss}
            aria="התעלם מהתובנה ל-7 ימים"
          />
        </div>
      ) : null}
    </div>
  );
}

function ActionChip({
  tone,
  icon,
  label,
  onClick,
  aria,
}: {
  tone: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  aria: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={aria}
      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60 active:scale-95"
      style={{
        color: tone,
        borderColor: `${tone}55`,
        background: `${tone}15`,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

export function useAttentionCount(): number {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);
  return useMemo(() => {
    if (!hydrated) return 0;
    let n = 0;
    for (const e of entries) {
      if (e.needsConfirmation && !e.confirmedAt) n += 1;
    }
    const monthKey = currentMonthKey();
    n += Math.min(
      3,
      gatherAiInsights({
        entries,
        rules,
        statuses,
        accounts,
        loans,
        incomes,
        monthlyBudget,
        monthKey,
      }).byGroup.risk.length,
    );
    n += Math.min(
      3,
      buildRecurringSectionSummary({
        entries,
        rules,
        statuses,
        monthKey,
      }).insightItems.length,
    );
    return n;
  }, [
    hydrated,
    entries,
    rules,
    statuses,
    accounts,
    loans,
    incomes,
    monthlyBudget,
  ]);
}
