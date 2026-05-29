"use client";

// Phase 294 — Attention Center bottom sheet.
//
// Single destination for every "this needs your eyes" signal the
// Home tab surfaces. Pulls from existing engines — no fake alerts.
//
// Phase 318 — Lifecycle + priority + dynamic emptying.
//   • Every item carries a stable id and a `signature` (the part of
//     the message that reflects a real value). When signature
//     changes the item is re-flagged NEW.
//   • Items move through new → viewed → resolved/snoozed.
//   • Confirm items stay until acted on (acknowledgment doesn't
//     count — the user must approve / delete).
//   • Risk + review items drop from the main list once VIEWED with
//     an unchanged signature. They re-surface only on real change.
//   • Main list is capped at 5 (priority-sorted); overflow chip
//     shows the rest.
//   • Empty state is calm — no red badges, no urgency.
//   • Auto-mark NEW non-confirm items as VIEWED after 2.5s in the
//     open sheet so "I saw it" registers without an extra tap.

import { useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  CalendarCheck,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  Landmark,
  Lightbulb,
  ListChecks,
  Sparkles,
  Trash2,
  Wallet,
  XCircle,
} from "lucide-react";

import type { Account, ExpenseEntry } from "@/types/finance";

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
import {
  markResolved,
  markViewed,
  snooze,
  useAttentionVersion,
  visibleState,
} from "@/lib/attention-state";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

type ConfirmSource = "credit" | "cash" | "bank" | "wallet";
type Priority = "critical" | "important" | "info";

type AttentionItem = {
  id: string;
  signature: string;
  priority: Priority;
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
  /** Confirm group only — amount used for delete confirmation gating. */
  amount?: number;
  /** Confirm group only — payment source for tone + icon. */
  source?: ConfirmSource;
  /** Review group only — maps the recurring-summary item kind to a
   *  DetectorKind + a stable targetId for the 7-day dismissal. */
  dismissKey?: { kind: DetectorKind; targetId: string };
  /** Confirm group only — date sort key so the list shows newest
   *  first and falls back to amount desc when timestamps tie. */
  whenMs?: number;
};

const SOURCE_TONE: Record<ConfirmSource, string> = {
  credit: "#60A5FA",
  cash: "#34D399",
  bank: "#22D3EE",
  wallet: "#A78BFA",
};

const SOURCE_LABEL: Record<ConfirmSource, string> = {
  credit: "אשראי",
  cash: "מזומן",
  bank: "בנק",
  wallet: "Wallet",
};

const PRIORITY_WEIGHT: Record<Priority, number> = {
  critical: 0,
  important: 1,
  info: 2,
};

const MAIN_CAP = 5;
const AUTO_VIEW_DELAY_MS = 2500;

function sourceIcon(s: ConfirmSource): React.ReactNode {
  if (s === "credit") return <CreditCard className="size-3.5" />;
  if (s === "cash") return <Banknote className="size-3.5" />;
  if (s === "bank") return <Landmark className="size-3.5" />;
  return <Wallet className="size-3.5" />;
}

function classifySource(e: ExpenseEntry, accounts: Account[]): ConfirmSource {
  if (e.source === "wallet") return "wallet";
  if (e.paymentMethod === "cash") return "cash";
  if (e.accountId) {
    const acc = accounts.find((a) => a.id === e.accountId);
    if (acc?.kind === "bank") return "bank";
    if (acc?.kind === "card") return "credit";
  }
  if (e.cardLast4) return "credit";
  return "credit";
}

function cardLabelFor(e: ExpenseEntry, accounts: Account[]): string | null {
  if (e.accountId) {
    const acc = accounts.find((a) => a.id === e.accountId);
    if (acc?.kind === "card") {
      const parts: string[] = [];
      if (acc.label) parts.push(acc.label);
      const tail = acc.cardLast4 ?? e.cardLast4;
      if (tail) parts.push(`****${tail}`);
      return parts.length ? parts.join(" ") : null;
    }
  }
  if (e.cardLast4) return `****${e.cardLast4}`;
  return null;
}

function formatWhen(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `היום ${hh}:${mm}`;
  }
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mo}`;
}

function buildItems(args: {
  hydrated: boolean;
  entries: ExpenseEntry[];
  rules: ReturnType<typeof useFinanceStore.getState>["rules"];
  statuses: ReturnType<typeof useFinanceStore.getState>["statuses"];
  accounts: Account[];
  loans: ReturnType<typeof useFinanceStore.getState>["loans"];
  incomes: ReturnType<typeof useFinanceStore.getState>["incomes"];
  monthlyBudget: number;
}): AttentionItem[] {
  if (!args.hydrated) return [];
  const monthKey = currentMonthKey();
  const out: AttentionItem[] = [];

  // 1. Pending confirmations — top priority.
  const confirmRows: AttentionItem[] = [];
  for (const e of args.entries) {
    if (!e.needsConfirmation || e.confirmedAt) continue;
    const source = classifySource(e, args.accounts);
    const tone = SOURCE_TONE[source];
    const whenStr = formatWhen(e.chargeDate ?? e.createdAt);
    const cardStr =
      source === "credit" ? cardLabelFor(e, args.accounts) : null;
    const detailParts = [
      ILS.format(Math.round(Math.abs(e.amount))),
      SOURCE_LABEL[source],
      cardStr,
      whenStr,
      "ממתין לקטגוריה",
    ].filter((p): p is string => Boolean(p));
    const whenMs = new Date(e.chargeDate ?? e.createdAt ?? 0).getTime();
    confirmRows.push({
      id: `confirm:${e.id}`,
      // Signature = entry id itself; until the user acts on it the
      // signature never changes, so the item stays NEW.
      signature: `pending:${e.id}`,
      priority: "critical",
      group: "confirm",
      title: e.merchant || e.note || "חיוב ממתין לאישור",
      detail: detailParts.join(" • "),
      tone,
      icon: sourceIcon(source),
      goTo: "dashboard",
      entryId: e.id,
      amount: Math.abs(e.amount),
      source,
      whenMs: Number.isFinite(whenMs) ? whenMs : 0,
    });
  }
  confirmRows.sort((a, b) => {
    const dt = (b.whenMs ?? 0) - (a.whenMs ?? 0);
    if (dt !== 0) return dt;
    return (b.amount ?? 0) - (a.amount ?? 0);
  });
  out.push(...confirmRows);

  // 2. AI risk insights — top 5; promoted to CRITICAL.
  const ai = gatherAiInsights({
    entries: args.entries,
    rules: args.rules,
    statuses: args.statuses,
    accounts: args.accounts,
    loans: args.loans,
    incomes: args.incomes,
    monthlyBudget: args.monthlyBudget,
    monthKey,
  });
  for (const ins of ai.byGroup.risk.slice(0, 5)) {
    out.push({
      id: `risk:${ins.id}`,
      // Signature carries the live value — if the body text changes
      // (number / phrasing) the item re-surfaces as NEW.
      signature: `risk:${ins.body}`,
      priority: "critical",
      group: "risk",
      title: ins.title,
      detail: ins.body,
      tone: "#F87171",
      icon: <AlertTriangle className="size-3.5" />,
      goTo: "setup",
    });
  }

  // 3. Recurring-section review items — top 5.
  const recurring = buildRecurringSectionSummary({
    entries: args.entries,
    rules: args.rules,
    statuses: args.statuses,
    monthKey,
  });
  for (const it of recurring.insightItems.slice(0, 5)) {
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
      signature: `review:${it.detail}`,
      priority: "important",
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
}

/** Filter for the main list: drop SNOOZED/RESOLVED; for non-confirm
 *  drop VIEWED too. Confirm items stay until acted on. */
function isVisibleInMain(
  state: ReturnType<typeof visibleState>,
  group: AttentionItem["group"],
): boolean {
  if (state === "snoozed" || state === "resolved") return false;
  if (state === "viewed" && group !== "confirm") return false;
  return true;
}

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
  const attentionVersion = useAttentionVersion();

  const allItems = useMemo<AttentionItem[]>(
    () =>
      buildItems({
        hydrated,
        entries,
        rules,
        statuses,
        accounts,
        loans,
        incomes,
        monthlyBudget,
      }),
    [hydrated, entries, rules, statuses, accounts, loans, incomes, monthlyBudget],
  );

  // Resolve lifecycle for every candidate item.
  const resolved = useMemo(() => {
    // Touch the version so changes in the state map trigger recompute.
    void attentionVersion;
    return allItems.map((it) => ({
      ...it,
      state: visibleState(it.id, it.signature),
    }));
  }, [allItems, attentionVersion]);

  const visible = useMemo(() => {
    const v = resolved.filter((it) => isVisibleInMain(it.state, it.group));
    v.sort((a, b) => {
      const p = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
      if (p !== 0) return p;
      // Within the same priority, confirm > risk > review; newer first.
      const g = (a.group === b.group ? 0 : a.group === "confirm" ? -1 : 1);
      if (g !== 0) return g;
      return (b.whenMs ?? 0) - (a.whenMs ?? 0);
    });
    return v;
  }, [resolved]);

  const mainList = visible.slice(0, MAIN_CAP);
  const overflowCount = Math.max(0, visible.length - mainList.length);

  // ── Auto-mark NEW non-confirm items as VIEWED after a short stay
  //    in the open sheet. Confirm items require explicit action.
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      for (const it of mainList) {
        if (it.group === "confirm") continue;
        if (it.state === "new") markViewed(it.id, it.signature);
      }
    }, AUTO_VIEW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [open, mainList]);

  const confirmExpense = useFinanceStore((s) => s.confirmExpense);
  const dismissPending = useFinanceStore((s) => s.dismissPending);

  function handleOpen(it: AttentionItem) {
    hapticTap();
    // Treat "open in tab" as full acknowledgment for non-confirm.
    if (it.group !== "confirm") markViewed(it.id, it.signature);
    closeAttentionCenter();
    navigateToTab(it.goTo, it.section);
  }

  function handleApprove(it: AttentionItem) {
    if (!it.entryId) return;
    hapticSuccess();
    confirmExpense(it.entryId, {});
  }

  function handleDelete(it: AttentionItem) {
    if (!it.entryId) return;
    if ((it.amount ?? 0) >= 500 && typeof window !== "undefined") {
      const amountStr = ILS.format(Math.round(it.amount ?? 0));
      const ok = window.confirm(`למחוק את החיוב ${amountStr} מהרשימה?`);
      if (!ok) return;
    }
    hapticTap();
    dismissPending(it.entryId);
  }

  function handleAcknowledge(it: AttentionItem) {
    hapticTap();
    // "הבנתי" — register VIEWED on confirm or RESOLVED on non-confirm
    // so the item leaves the main list immediately.
    if (it.group === "confirm") {
      markViewed(it.id, it.signature);
    } else {
      markResolved(it.id, it.signature);
    }
  }

  function handleSnooze(it: AttentionItem) {
    hapticTap();
    snooze(it.id, it.signature, 24);
  }

  function handleDismiss(it: AttentionItem) {
    hapticTap();
    // Combine the legacy 7-day dismissal (where applicable) with our
    // lifecycle RESOLVED so the item also leaves the main list now.
    if (it.dismissKey) dismissInsight(it.dismissKey.kind, it.dismissKey.targetId);
    markResolved(it.id, it.signature);
  }

  const isCalm = visible.length === 0;
  const newCount = resolved.filter(
    (it) => it.state === "new" && isVisibleInMain(it.state, it.group),
  ).length;

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
        {isCalm ? null : (
          <span className="text-caption text-muted-foreground">
            {newCount > 0 ? `${newCount} חדשים · ` : ""}
            {visible.length} סך הכל
          </span>
        )}
      </header>

      {isCalm ? (
        <CalmEmpty />
      ) : (
        <>
          <p className="text-caption text-muted-foreground">
            עד {MAIN_CAP} פריטים בכל פעם, מסודרים לפי עדיפות. פריטים יורדים
            מהרשימה ברגע שראית אותם או טיפלת בהם.
          </p>

          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {mainList.map((it, idx) => (
                <motion.li
                  key={it.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6, height: 0, marginTop: 0 }}
                  transition={{
                    delay: Math.min(idx * 0.04, 0.2),
                    duration: 0.24,
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
                      <span className="flex items-baseline gap-1.5">
                        <PriorityDot priority={it.priority} />
                        <span className="text-body text-foreground">
                          {it.title}
                        </span>
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
                    onAcknowledge={() => handleAcknowledge(it)}
                    onSnooze={() => handleSnooze(it)}
                    onDismiss={() => handleDismiss(it)}
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>

          {overflowCount > 0 ? (
            <p className="text-center text-[11px] text-muted-foreground/70">
              + {overflowCount} פריטים נוספים יוצגו כשתטפל בעליונים
            </p>
          ) : null}
        </>
      )}
    </BottomSheet>
  );
}

function CalmEmpty() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/8 bg-black/20 p-6 text-center">
      <CheckCircle2 className="size-7 text-[#34D399]" />
      <span className="text-section text-foreground">הכל נראה תקין השבוע</span>
      <span className="text-caption text-muted-foreground/85">
        אין חריגות חדשות, התראות חוזרות או פריטים שדורשים בדיקה. Pulse ימשיך
        לעקוב ויקפיץ אותך רק כשיהיה משהו אמיתי.
      </span>
    </div>
  );
}

function PriorityDot({ priority }: { priority: Priority }) {
  const color =
    priority === "critical"
      ? "#F87171"
      : priority === "important"
        ? "#FBBF24"
        : "#60A5FA";
  const label =
    priority === "critical"
      ? "עדיפות גבוהה"
      : priority === "important"
        ? "עדיפות בינונית"
        : "מידע";
  return (
    <span
      aria-label={label}
      title={label}
      className="size-1.5 shrink-0 rounded-full"
      style={{ background: color }}
    />
  );
}

function ActionRow({
  item,
  onOpen,
  onApprove,
  onDelete,
  onAcknowledge,
  onSnooze,
  onDismiss,
}: {
  item: AttentionItem;
  onOpen: () => void;
  onApprove: () => void;
  onDelete: () => void;
  onAcknowledge: () => void;
  onSnooze: () => void;
  onDismiss: () => void;
}) {
  if (item.group === "confirm") {
    return (
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
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
        <ActionChip
          tone="#A1A1AA"
          icon={<Clock className="size-3" />}
          label="מחר"
          onClick={onSnooze}
          aria="הזכר לי מחר"
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

  // risk + review share the acknowledge / open / snooze / dismiss row.
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      <ActionChip
        tone="#34D399"
        icon={<Check className="size-3" />}
        label="הבנתי"
        onClick={onAcknowledge}
        aria="סמן שהבנת והסר מהרשימה"
      />
      <ActionChip
        tone="#60A5FA"
        icon={<ArrowLeft className="size-3" />}
        label="פתח"
        onClick={onOpen}
        aria="פתח את המסך הקשור"
      />
      <ActionChip
        tone="#A1A1AA"
        icon={<Clock className="size-3" />}
        label="מחר"
        onClick={onSnooze}
        aria="הזכר לי מחר"
      />
      <div className="ms-auto">
        <ActionChip
          tone="#A1A1AA"
          icon={<XCircle className="size-3" />}
          label="התעלם"
          onClick={onDismiss}
          aria="התעלם מהתובנה"
        />
      </div>
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

/** Badge count — only NEW items still visible in the main list. The
 *  number tracks what the user hasn't seen yet, not raw item count,
 *  so the badge shrinks as the user reads through. */
export function useAttentionCount(): number {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const entries = useFinanceStore((s) => s.entries);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const monthlyBudget = useFinanceStore((s) => s.monthlyBudget);
  const version = useAttentionVersion();

  return useMemo(() => {
    if (!hydrated) return 0;
    const items = buildItems({
      hydrated,
      entries,
      rules,
      statuses,
      accounts,
      loans,
      incomes,
      monthlyBudget,
    });
    // Force recompute on state mutation.
    void version;
    let n = 0;
    for (const it of items) {
      const state = visibleState(it.id, it.signature);
      if (state !== "new") continue;
      if (!isVisibleInMain(state, it.group)) continue;
      n += 1;
    }
    return Math.min(n, 99);
  }, [
    hydrated,
    entries,
    rules,
    statuses,
    accounts,
    loans,
    incomes,
    monthlyBudget,
    version,
  ]);
}
