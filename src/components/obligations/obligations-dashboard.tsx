"use client";

// Obligations dashboard — premium expanded experience for the Home
// "חיובים קבועים והלוואות" section.
//
// UI/UX only. Every value flows from buildObligationsOverview (which
// itself is a pure compute over store.loans + store.rules + store.
// accounts). No engine, forecast, store schema, or calculation is
// touched. Edit still opens the existing LoanFullScreenEdit shell.
// Pause / delete route to store.toggleLoan / deleteLoan exactly the
// way the legacy inline panel did.
//
// Progressive disclosure:
//   1. Four summary tiles (headline numbers).
//   2. Tap "הלוואות" or "קבועים" tile → inline gallery of premium
//      per-item cards animates in.
//   3. Tap any card → LoanFullScreenEdit (existing). Actions menu
//      per-card exposes pause / delete without swipe gymnastics.

import { useMemo, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  Banknote,
  CalendarClock,
  MoreHorizontal,
  Pause,
  Play,
  Sparkles,
  Trash2,
  Wallet,
} from "lucide-react";

import { LoanFullScreenEdit } from "@/components/loans/loan-fullscreen-edit";
import { useFinanceStore } from "@/lib/store";
import { currentMonthKey } from "@/lib/dates";
import {
  buildObligationsOverview,
  type LoanRow,
} from "@/lib/obligations-overview";
import { getCategory } from "@/lib/categories";
import { tap as hapticTap } from "@/lib/haptics";
import type { RecurringRule } from "@/types/finance";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const DATE_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
});
const DATE_FMT_LONG = new Intl.DateTimeFormat("he-IL", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

const EASE = [0.32, 0.72, 0, 1] as const;

type Lens = "loans" | "fixed" | "next" | "debt" | null;

export function ObligationsDashboard() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const loans = useFinanceStore((s) => s.loans);
  const rules = useFinanceStore((s) => s.rules);
  const accounts = useFinanceStore((s) => s.accounts);
  const toggleLoan = useFinanceStore((s) => s.toggleLoan);
  const deleteLoan = useFinanceStore((s) => s.deleteLoan);
  const toggleRule = useFinanceStore((s) => s.toggleRule);
  const deleteRule = useFinanceStore((s) => s.deleteRule);

  const [lens, setLens] = useState<Lens>(null);
  const [editingLoanId, setEditingLoanId] = useState<string | null>(null);
  const [loanEditorOpen, setLoanEditorOpen] = useState(false);

  const overview = useMemo(() => {
    if (!hydrated) return null;
    return buildObligationsOverview({
      loans,
      rules,
      accounts,
      monthKey: currentMonthKey(),
    });
  }, [hydrated, loans, rules, accounts]);

  const activeRulesThisMonth = useMemo<RecurringRule[]>(
    () =>
      rules
        .filter((r) => r.active)
        .slice()
        .sort((a, b) => a.dayOfMonth - b.dayOfMonth),
    [rules],
  );

  const upcoming = useMemo(
    () => pickUpcoming(overview?.loans ?? [], activeRulesThisMonth, 8),
    [overview, activeRulesThisMonth],
  );

  if (!hydrated || !overview) return <SkeletonState />;
  if (overview.loansMonthly === 0 && overview.fixedMonthly === 0) {
    return <EmptyState />;
  }

  const nextEvent = pickNextEvent(overview.loans, activeRulesThisMonth);
  const totalRemainingDebt = overview.loans.reduce((sum, l) => {
    const rem = l.remainingPayments ?? 0;
    return sum + rem * l.loan.monthlyInstallment;
  }, 0);

  function openLoanEditor(loanId: string) {
    hapticTap();
    setEditingLoanId(loanId);
    setLoanEditorOpen(true);
  }

  function toggleLens(next: Lens) {
    hapticTap();
    setLens((prev) => (prev === next ? null : next));
  }

  return (
    <div className="ob-dashboard" data-lens-open={lens ?? undefined} dir="rtl">
      <div className="ob-launcher-grid">
        <LauncherTile
          eyebrow="הלוואות"
          headline={String(overview.loans.length)}
          headlineSub={ILS.format(overview.loansMonthly)}
          tone="purple"
          glyph={<Banknote className="size-4" />}
          active={lens === "loans"}
          dimmed={lens !== null && lens !== "loans"}
          onClick={() => toggleLens("loans")}
        />
        <LauncherTile
          eyebrow="חיובים קבועים"
          headline={String(activeRulesThisMonth.length)}
          headlineSub={ILS.format(overview.fixedMonthly)}
          tone="cyan"
          glyph={<Sparkles className="size-4" />}
          active={lens === "fixed"}
          dimmed={lens !== null && lens !== "fixed"}
          onClick={() => toggleLens("fixed")}
        />
        <LauncherTile
          eyebrow="הבא בתור"
          headline={
            nextEvent ? DATE_FMT.format(nextEvent.date) : "—"
          }
          headlineSub={nextEvent ? ILS.format(nextEvent.amount) : "אין"}
          tone="safe"
          glyph={<CalendarClock className="size-4" />}
          active={lens === "next"}
          dimmed={lens !== null && lens !== "next"}
          onClick={() => toggleLens("next")}
        />
        <LauncherTile
          eyebrow="יתרת חוב"
          headline={ILS.format(totalRemainingDebt)}
          headlineSub={
            overview.loans.length === 0
              ? "אין הלוואות"
              : `${overview.loans.length} ${
                  overview.loans.length === 1 ? "הלוואה" : "הלוואות"
                }`
          }
          tone="watch"
          glyph={<Wallet className="size-4" />}
          active={lens === "debt"}
          dimmed={lens !== null && lens !== "debt"}
          onClick={() => toggleLens("debt")}
        />
      </div>

      <AnimatePresence initial={false} mode="wait">
        {lens === "loans" ? (
          <LoansLens
            key="loans"
            loans={overview.loans}
            onEdit={openLoanEditor}
            onPause={(id) => {
              hapticTap();
              toggleLoan(id);
            }}
            onDelete={(id) => {
              hapticTap();
              deleteLoan(id);
            }}
          />
        ) : null}
        {lens === "fixed" ? (
          <FixedLens
            key="fixed"
            rules={activeRulesThisMonth}
            onPause={(id) => {
              hapticTap();
              toggleRule(id);
            }}
            onDelete={(id) => {
              hapticTap();
              deleteRule(id);
            }}
          />
        ) : null}
        {lens === "next" ? (
          <NextLens key="next" events={upcoming} />
        ) : null}
        {lens === "debt" ? (
          <DebtLens key="debt" loans={overview.loans} onEdit={openLoanEditor} />
        ) : null}
      </AnimatePresence>

      <LoanFullScreenEdit
        loanId={editingLoanId}
        open={loanEditorOpen}
        onOpenChange={(o) => {
          setLoanEditorOpen(o);
          if (!o) setEditingLoanId(null);
        }}
      />
    </div>
  );
}

// ── Launcher tile ─────────────────────────────────────────────

function LauncherTile({
  eyebrow,
  headline,
  headlineSub,
  tone,
  glyph,
  active,
  dimmed,
  onClick,
}: {
  eyebrow: string;
  headline: string;
  headlineSub: string;
  tone: "purple" | "cyan" | "safe" | "watch";
  glyph: React.ReactNode;
  active: boolean;
  dimmed: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      className="ob-launcher"
      data-tone={tone}
      data-active={active ? "true" : undefined}
      data-dimmed={dimmed ? "true" : undefined}
      onClick={onClick}
      aria-expanded={active}
      aria-label={`${eyebrow} · ${headline}`}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
    >
      <span aria-hidden className="ob-launcher-halo" />
      <span aria-hidden className="ob-launcher-glyph">
        {glyph}
      </span>
      <span className="ob-launcher-eyebrow">{eyebrow}</span>
      <span className="ob-launcher-headline" data-mono="true" dir="ltr">
        {headline}
      </span>
      <span className="ob-launcher-sub" data-mono="true" dir="ltr">
        {headlineSub}
      </span>
    </motion.button>
  );
}

// ── Loans lens ──────────────────────────────────────────────

function LoansLens({
  loans,
  onEdit,
  onPause,
  onDelete,
}: {
  loans: LoanRow[];
  onEdit: (id: string) => void;
  onPause: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.section
      layout
      className="ob-lens"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
      transition={{ duration: reduced ? 0.12 : 0.42, ease: EASE }}
    >
      <header className="ob-lens-head">
        <span className="ob-lens-eyebrow">כל ההלוואות</span>
        <span className="ob-lens-count" data-mono="true" dir="ltr">
          {loans.length}
        </span>
      </header>
      {loans.length === 0 ? (
        <div className="ob-empty">אין הלוואות פעילות כרגע.</div>
      ) : (
        <ul className="ob-cards">
          {loans.map((row, idx) => (
            <LoanCard
              key={row.loan.id}
              row={row}
              delay={Math.min(idx * 0.04, 0.24)}
              onEdit={() => onEdit(row.loan.id)}
              onPause={() => onPause(row.loan.id)}
              onDelete={() => onDelete(row.loan.id)}
            />
          ))}
        </ul>
      )}
    </motion.section>
  );
}

function LoanCard({
  row,
  delay,
  onEdit,
  onPause,
  onDelete,
}: {
  row: LoanRow;
  delay: number;
  onEdit: () => void;
  onPause: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const reduced = useReducedMotion();
  const loan = row.loan;
  const total = loan.totalPayments;
  const paidCount =
    total !== undefined && row.remainingPayments !== undefined
      ? total - row.remainingPayments
      : null;
  const progress =
    total !== undefined && paidCount !== null
      ? Math.max(0, Math.min(1, paidCount / total))
      : null;
  const statusTone =
    row.status === "ending-soon"
      ? "watch"
      : row.status === "starting-soon"
        ? "safe"
        : "neutral";
  const statusLabel =
    row.status === "ending-soon"
      ? "לקראת סיום"
      : row.status === "starting-soon"
        ? "מתחיל בקרוב"
        : "פעיל";

  return (
    <motion.li
      layout
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: reduced ? 0.12 : 0.42, ease: EASE }}
      className="ob-card"
      data-lane="loan"
    >
      <button
        type="button"
        onClick={onEdit}
        className="ob-card-surface"
        aria-label={`ערוך את ההלוואה ${loan.label}`}
      >
        <div className="ob-card-head">
          <span aria-hidden className="ob-card-icon">
            <Banknote className="size-5" strokeWidth={1.6} />
          </span>
          <div className="ob-card-titles">
            <span className="ob-card-title">{loan.label}</span>
            <span className="ob-card-sub">
              {row.paymentLabel
                ? `תשלום ${row.paymentLabel}`
                : loan.active
                  ? "הלוואה פעילה"
                  : "הלוואה מושהית"}
            </span>
          </div>
          <span className={`ob-card-status ob-tone-${statusTone}`}>
            {statusLabel}
          </span>
        </div>

        <div className="ob-card-money">
          <div className="ob-card-money-block">
            <span className="ob-card-money-label">חיוב חודשי</span>
            <span
              className="ob-card-money-value"
              data-mono="true"
              dir="ltr"
            >
              {ILS.format(loan.monthlyInstallment)}
            </span>
          </div>
          {row.remainingPayments !== undefined ? (
            <div className="ob-card-money-block">
              <span className="ob-card-money-label">נותרו</span>
              <span
                className="ob-card-money-value"
                data-mono="true"
                dir="ltr"
              >
                {row.remainingPayments} ×
              </span>
            </div>
          ) : null}
          <div className="ob-card-money-block">
            <span className="ob-card-money-label">חיוב הבא</span>
            <span
              className="ob-card-money-value"
              data-mono="true"
              dir="ltr"
            >
              {DATE_FMT.format(row.nextChargeDate)}
            </span>
          </div>
        </div>

        {progress !== null ? (
          <div className="ob-card-progress">
            <div className="ob-card-progress-track">
              <motion.div
                className="ob-card-progress-fill"
                initial={{ width: reduced ? `${progress * 100}%` : 0 }}
                animate={{ width: `${progress * 100}%` }}
                transition={{ duration: reduced ? 0.12 : 0.9, ease: EASE }}
              />
            </div>
            <div className="ob-card-progress-labels">
              <span data-mono="true" dir="ltr">
                {paidCount}/{total}
              </span>
              <span>{Math.round((progress ?? 0) * 100)}% שולם</span>
            </div>
          </div>
        ) : null}
      </button>

      <ActionsMenu
        open={menuOpen}
        onToggle={() => setMenuOpen((v) => !v)}
        actions={[
          {
            key: "pause",
            label: loan.active ? "השהה חיוב" : "הפעל חיוב",
            icon: loan.active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />,
            onClick: onPause,
          },
          {
            key: "delete",
            label: "מחק הלוואה",
            icon: <Trash2 className="size-3.5" />,
            danger: true,
            onClick: onDelete,
          },
        ]}
      />
    </motion.li>
  );
}

// ── Fixed lens ──────────────────────────────────────────────

function FixedLens({
  rules,
  onPause,
  onDelete,
}: {
  rules: RecurringRule[];
  onPause: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.section
      layout
      className="ob-lens"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
      transition={{ duration: reduced ? 0.12 : 0.42, ease: EASE }}
    >
      <header className="ob-lens-head">
        <span className="ob-lens-eyebrow">כל החיובים הקבועים</span>
        <span className="ob-lens-count" data-mono="true" dir="ltr">
          {rules.length}
        </span>
      </header>
      {rules.length === 0 ? (
        <div className="ob-empty">אין חיובים קבועים פעילים.</div>
      ) : (
        <ul className="ob-cards">
          {rules.map((rule, idx) => (
            <RecurringCard
              key={rule.id}
              rule={rule}
              delay={Math.min(idx * 0.03, 0.18)}
              onPause={() => onPause(rule.id)}
              onDelete={() => onDelete(rule.id)}
            />
          ))}
        </ul>
      )}
    </motion.section>
  );
}

function RecurringCard({
  rule,
  delay,
  onPause,
  onDelete,
}: {
  rule: RecurringRule;
  delay: number;
  onPause: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const reduced = useReducedMotion();
  const cat = getCategory(rule.category);
  const CatIcon = cat.icon;
  const nextDate = nextChargeDate(rule.dayOfMonth);
  const statusLabel = rule.active ? "פעיל" : "מושהה";

  return (
    <motion.li
      layout
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: reduced ? 0.12 : 0.42, ease: EASE }}
      className="ob-card"
      data-lane="fixed"
      style={
        {
          "--ob-card-accent": cat.accent,
        } as React.CSSProperties
      }
    >
      <div className="ob-card-surface" aria-label={rule.label}>
        <div className="ob-card-head">
          <span aria-hidden className="ob-card-icon">
            <CatIcon className="size-5" strokeWidth={1.6} />
          </span>
          <div className="ob-card-titles">
            <span className="ob-card-title">{rule.label}</span>
            <span className="ob-card-sub">{cat.label}</span>
          </div>
          <span
            className={`ob-card-status ${
              rule.active ? "ob-tone-neutral" : "ob-tone-watch"
            }`}
          >
            {statusLabel}
          </span>
        </div>

        <div className="ob-card-money">
          <div className="ob-card-money-block">
            <span className="ob-card-money-label">חיוב חודשי</span>
            <span
              className="ob-card-money-value"
              data-mono="true"
              dir="ltr"
            >
              {ILS.format(rule.estimatedAmount)}
            </span>
          </div>
          <div className="ob-card-money-block">
            <span className="ob-card-money-label">חיוב הבא</span>
            <span
              className="ob-card-money-value"
              data-mono="true"
              dir="ltr"
            >
              {DATE_FMT.format(nextDate)}
            </span>
          </div>
          <div className="ob-card-money-block">
            <span className="ob-card-money-label">יום בחודש</span>
            <span
              className="ob-card-money-value"
              data-mono="true"
              dir="ltr"
            >
              {rule.dayOfMonth}
            </span>
          </div>
        </div>
      </div>

      <ActionsMenu
        open={menuOpen}
        onToggle={() => setMenuOpen((v) => !v)}
        actions={[
          {
            key: "pause",
            label: rule.active ? "השהה חיוב" : "הפעל חיוב",
            icon: rule.active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />,
            onClick: onPause,
          },
          {
            key: "delete",
            label: "מחק חיוב",
            icon: <Trash2 className="size-3.5" />,
            danger: true,
            onClick: onDelete,
          },
        ]}
      />
    </motion.li>
  );
}

// ── Actions menu ────────────────────────────────────────────

type Action = {
  key: string;
  label: string;
  icon: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
};

function ActionsMenu({
  open,
  onToggle,
  actions,
}: {
  open: boolean;
  onToggle: () => void;
  actions: Action[];
}) {
  const reduced = useReducedMotion();
  return (
    <div className="ob-card-actions">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label="פתח תפריט פעולות"
        className="ob-card-actions-trigger"
      >
        <MoreHorizontal className="size-4" />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            key="menu"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: reduced ? 0.12 : 0.24, ease: EASE }}
            role="menu"
            className="ob-card-actions-menu"
          >
            {actions.map((a) => (
              <button
                key={a.key}
                type="button"
                role="menuitem"
                onClick={() => {
                  a.onClick();
                  onToggle();
                }}
                className="ob-card-actions-item"
                data-danger={a.danger ? "true" : undefined}
              >
                <span aria-hidden className="ob-card-actions-item-icon">
                  {a.icon}
                </span>
                {a.label}
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ── Next lens (upcoming timeline) ───────────────────────────

function NextLens({
  events,
}: {
  events: Array<{ label: string; amount: number; date: Date; kind: "loan" | "rule" }>;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.section
      layout
      className="ob-lens"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
      transition={{ duration: reduced ? 0.12 : 0.42, ease: EASE }}
    >
      <header className="ob-lens-head">
        <span className="ob-lens-eyebrow">חיובים בדרך</span>
        <span className="ob-lens-count" data-mono="true" dir="ltr">
          {events.length}
        </span>
      </header>
      {events.length === 0 ? (
        <div className="ob-empty">אין חיובים ידועים בהמתנה.</div>
      ) : (
        <ul className="ob-timeline">
          {events.map((e, i) => (
            <motion.li
              key={`${e.date.toISOString()}-${i}`}
              layout
              initial={reduced ? { opacity: 0 } : { opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                delay: Math.min(i * 0.04, 0.24),
                duration: reduced ? 0.12 : 0.42,
                ease: EASE,
              }}
              className="ob-timeline-row"
              data-kind={e.kind}
            >
              <span aria-hidden className="ob-timeline-dot" />
              <span aria-hidden className="ob-timeline-rule" />
              <div className="ob-timeline-body">
                <span className="ob-timeline-date" data-mono="true" dir="ltr">
                  {DATE_FMT_LONG.format(e.date)}
                </span>
                <span className="ob-timeline-label">{e.label}</span>
              </div>
              <span className="ob-timeline-amount" data-mono="true" dir="ltr">
                {ILS.format(e.amount)}
              </span>
            </motion.li>
          ))}
        </ul>
      )}
    </motion.section>
  );
}

// ── Debt lens (per-loan remaining) ──────────────────────────

function DebtLens({
  loans,
  onEdit,
}: {
  loans: LoanRow[];
  onEdit: (id: string) => void;
}) {
  const reduced = useReducedMotion();
  const rows = useMemo(
    () =>
      loans
        .map((l) => {
          const total = l.loan.totalPayments;
          const remaining = l.remainingPayments;
          const paid = total !== undefined && remaining !== undefined ? total - remaining : null;
          const remainingDebt =
            remaining !== undefined ? remaining * l.loan.monthlyInstallment : null;
          const progress =
            total !== undefined && paid !== null ? Math.max(0, Math.min(1, paid / total)) : null;
          return { row: l, paid, total, remaining, remainingDebt, progress };
        })
        .sort((a, b) => (b.remainingDebt ?? 0) - (a.remainingDebt ?? 0)),
    [loans],
  );
  const grandTotal = rows.reduce((s, r) => s + (r.remainingDebt ?? 0), 0);

  return (
    <motion.section
      layout
      className="ob-lens"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
      transition={{ duration: reduced ? 0.12 : 0.42, ease: EASE }}
    >
      <header className="ob-lens-head">
        <span className="ob-lens-eyebrow">פירוט חוב</span>
        <span className="ob-lens-total" data-mono="true" dir="ltr">
          {ILS.format(grandTotal)}
        </span>
      </header>
      {rows.length === 0 ? (
        <div className="ob-empty">אין חוב פעיל.</div>
      ) : (
        <ul className="ob-debt-list">
          {rows.map((r, i) => (
            <motion.li
              key={r.row.loan.id}
              layout
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: Math.min(i * 0.04, 0.24),
                duration: reduced ? 0.12 : 0.42,
                ease: EASE,
              }}
              className="ob-debt-row"
            >
              <button
                type="button"
                className="ob-debt-row-surface"
                onClick={() => onEdit(r.row.loan.id)}
                aria-label={`ערוך את ההלוואה ${r.row.loan.label}`}
              >
                <div className="ob-debt-row-head">
                  <span className="ob-debt-row-title">{r.row.loan.label}</span>
                  <span className="ob-debt-row-amount" data-mono="true" dir="ltr">
                    {r.remainingDebt !== null ? ILS.format(r.remainingDebt) : "—"}
                  </span>
                </div>
                <div className="ob-debt-row-meta">
                  <span data-mono="true" dir="ltr">
                    {ILS.format(r.row.loan.monthlyInstallment)}/ח׳
                  </span>
                  <span aria-hidden>·</span>
                  <span>
                    {r.remaining !== undefined
                      ? `נותרו ${r.remaining} תשלומים`
                      : "הלוואה פתוחה"}
                  </span>
                </div>
                {r.progress !== null ? (
                  <div className="ob-debt-bar">
                    <motion.span
                      className="ob-debt-bar-fill"
                      initial={{ width: reduced ? `${r.progress * 100}%` : 0 }}
                      animate={{ width: `${r.progress * 100}%` }}
                      transition={{ duration: reduced ? 0.12 : 0.9, ease: EASE }}
                    />
                  </div>
                ) : null}
              </button>
            </motion.li>
          ))}
        </ul>
      )}
    </motion.section>
  );
}

// ── Empty / skeleton ────────────────────────────────────────

function EmptyState() {
  return (
    <div className="ob-empty-hero" dir="rtl">
      <span aria-hidden className="ob-empty-orb" />
      <span className="ob-empty-title">עוד אין חיובים קבועים</span>
      <span className="ob-empty-hint">
        הוסף הלוואה או חיוב חודשי מהאשף כדי לראות תמונת מצב חיה.
      </span>
    </div>
  );
}

function SkeletonState() {
  return <div className="ob-skeleton" aria-hidden />;
}

// ── Helpers ────────────────────────────────────────────────

function nextChargeDate(dayOfMonth: number): Date {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  if (dayOfMonth >= d) return new Date(y, m, dayOfMonth);
  return new Date(y, m + 1, dayOfMonth);
}

function pickNextEvent(
  loans: LoanRow[],
  rules: RecurringRule[],
): { label: string; amount: number; date: Date } | null {
  const list = pickUpcoming(loans, rules, 1);
  return list[0] ?? null;
}

function pickUpcoming(
  loans: LoanRow[],
  rules: RecurringRule[],
  limit: number,
): Array<{ label: string; amount: number; date: Date; kind: "loan" | "rule" }> {
  const out: Array<{
    label: string;
    amount: number;
    date: Date;
    kind: "loan" | "rule";
  }> = [];
  for (const l of loans) {
    if (l.monthlyAmount <= 0) continue;
    out.push({
      label: l.loan.label,
      amount: l.monthlyAmount,
      date: l.nextChargeDate,
      kind: "loan",
    });
  }
  for (const r of rules) {
    out.push({
      label: r.label,
      amount: r.estimatedAmount,
      date: nextChargeDate(r.dayOfMonth),
      kind: "rule",
    });
  }
  out.sort((a, b) => a.date.getTime() - b.date.getTime());
  return out.slice(0, limit);
}
