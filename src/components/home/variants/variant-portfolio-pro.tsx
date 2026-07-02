"use client";

// Variant D · Portfolio Pro
//
// Hero (approved) + full-page premium redesign below. UI-only. Reads
// existing engine surfaces only. Every mutation goes through existing
// store setters. No engine, no data-model change.

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { ExpenseDialog } from "@/components/expense-form/expense-dialog";
import { WithdrawalDialog } from "@/components/expense-form/withdrawal-dialog";
import { CATEGORIES, getCategory, type CategoryId } from "@/lib/categories";
import { useFinanceStore } from "@/lib/store";
import { navigateToTab } from "@/lib/tab-nav";

import { HeroDigitSettle } from "../hero-digit-settle";
import { Eyebrow, HairlineShelf } from "../primitives";
import type {
  HomeActivityRow,
  HomeCardRow,
  HomeData,
  HomeHealthCheck,
  HomeIncomeRow,
  HomeLoanRow,
  HomePendingRow,
  HomeRule,
  HomeUpcomingRow,
} from "../use-home-data";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const PCT = new Intl.NumberFormat("he-IL", {
  style: "percent",
  maximumFractionDigits: 0,
});
const DATE_FMT = new Intl.DateTimeFormat("he-IL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const DAY_MO_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
});

type SheetKind =
  | null
  | "hero"
  | "daily"
  | "checkpoint"
  | "upcoming"
  | "upcomingItem"
  | "incomes"
  | "income"
  | "loans"
  | "loan"
  | "cards"
  | "card"
  | "banks"
  | "categories"
  | "category"
  | "activity"
  | "activityItem"
  | "activityEdit"
  | "pending"
  | "fixed"
  | "fixedItem";

// ── Component ─────────────────────────────────────────────────

export function VariantPortfolioPro({ data }: { data: HomeData }) {
  const reduced = useReducedMotion();
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [pickedCheckpoint, setPickedCheckpoint] = useState<HomeData["checkpoints"][number] | null>(
    data.checkpoints[0] ?? null,
  );
  const [pickedUpcoming, setPickedUpcoming] = useState<HomeUpcomingRow | null>(null);
  const [pickedIncome, setPickedIncome] = useState<HomeIncomeRow | null>(null);
  const [pickedLoan, setPickedLoan] = useState<HomeLoanRow | null>(null);
  const [pickedCard, setPickedCard] = useState<HomeCardRow | null>(null);
  const [pickedActivity, setPickedActivity] = useState<HomeActivityRow | null>(null);
  const [pickedFixed, setPickedFixed] = useState<HomeRule | null>(null);

  const updateExpense = useFinanceStore((s) => s.updateExpense);
  const deleteExpense = useFinanceStore((s) => s.deleteExpense);
  const restoreExpense = useFinanceStore((s) => s.restoreExpense);
  const confirmExpense = useFinanceStore((s) => s.confirmExpense);
  const dismissPending = useFinanceStore((s) => s.dismissPending);
  const entries = useFinanceStore((s) => s.entries);

  const balanceLabel = ILS.format(data.live);
  const eomTone: "safe" | "watch" | "danger" =
    data.safetyState === "stress"
      ? "danger"
      : data.safetyState === "watch"
        ? "watch"
        : "safe";
  const donutRatio =
    data.eomBudget > 0 ? Math.min(1, data.budgetUsedPct / 100) : 0;
  const safetyMarker = Math.max(
    0.05,
    Math.min(0.95, data.eomBudget > 0 ? data.budgetUsedPct / 100 : 0.5),
  );

  const closeSheet = () => setSheet(null);

  // Recent-item edit/delete actions
  const handleDeleteRecent = () => {
    if (!pickedActivity) return;
    const original = entries.find((e) => e.id === pickedActivity.id);
    deleteExpense(pickedActivity.id);
    closeSheet();
    toast(`נמחק: ${pickedActivity.label}`, {
      action: original
        ? { label: "בטל", onClick: () => restoreExpense(original) }
        : undefined,
    });
  };
  const handleChangeCategory = (id: CategoryId) => {
    if (!pickedActivity) return;
    const updated = updateExpense(pickedActivity.id, { category: id });
    if (!updated) {
      toast.error("לא הצלחנו לעדכן את הקטגוריה.");
      return;
    }
    setSheet("activityItem");
    toast.success(`הקטגוריה עודכנה ל-${getCategory(id).label}`);
  };
  const handleConfirmPending = (row: HomePendingRow) => {
    confirmExpense(row.id);
    toast.success("העסקה אושרה");
  };
  const handleRejectPending = (row: HomePendingRow) => {
    const original = entries.find((e) => e.id === row.id);
    dismissPending(row.id);
    toast(`נדחתה: ${row.label}`, {
      action: original
        ? { label: "בטל", onClick: () => restoreExpense(original) }
        : undefined,
    });
  };

  const sheetTitle = (() => {
    switch (sheet) {
      case "hero": return "פירוט יתרה";
      case "daily": return "מותר להוציא היום";
      case "checkpoint": return pickedCheckpoint?.label ?? "צ׳קפוינט";
      case "upcoming": return "14 ימים קדימה";
      case "upcomingItem": return pickedUpcoming?.label ?? "אירוע";
      case "incomes": return "משכורות והכנסות";
      case "income": return pickedIncome?.label ?? "הכנסה";
      case "loans": return "הלוואות פעילות";
      case "loan": return pickedLoan?.label ?? "הלוואה";
      case "cards": return "כרטיסי אשראי";
      case "card": return pickedCard?.label ?? "כרטיס";
      case "banks": return "חשבונות בנק";
      case "categories": return "לאן הולך הכסף";
      case "activity": return "פעולות אחרונות";
      case "activityItem": return pickedActivity?.label ?? "פעולה";
      case "activityEdit": return "שנה קטגוריה";
      case "pending": return "עסקאות ממתינות לאישור";
      case "fixed": return "חיובים קבועים";
      case "fixedItem": return pickedFixed?.label ?? "חיוב קבוע";
      default: return "";
    }
  })();

  return (
    <div className="pro-stack">
      {/* ── Personalized greeting ─────────────────────── */}
      <header className="pro-greet">
        <span className="pro-greet-headline">{data.greeting.headline}.</span>
        <span className="pro-greet-subline">{data.greeting.subline}</span>
      </header>

      {/* ── APPROVED HERO ─────────────────────────────── */}
      <motion.article
        className="pro-hero"
        onClick={() => setSheet("hero")}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" ? setSheet("hero") : undefined)}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
      >
        <motion.span
          aria-hidden
          className="pro-hero-aurora"
          animate={reduced ? undefined : { backgroundPosition: ["90% -12%", "10% 112%", "90% -12%"] }}
          transition={{ duration: reduced ? 0.1 : 32, ease: "easeInOut", repeat: Infinity }}
        />
        <span aria-hidden className="pro-hero-gloss" />
        <span aria-hidden className="pro-hero-emboss" />

        <div className="pro-hero-head">
          <div>
            <Eyebrow accent>SALLY · PORTFOLIO</Eyebrow>
            <span className="pro-hero-month">{data.monthLabel}</span>
          </div>
          <span className="pro-hero-status" data-aurora-tone={eomTone}>
            <span aria-hidden className="pro-hero-status-dot" />
            {data.safetyLabel}
          </span>
        </div>

        <div className="pro-hero-columns">
          <div className="pro-hero-left">
            <Eyebrow>יתרה חיה</Eyebrow>
            <div className="pro-hero-balance">
              <HeroDigitSettle value={balanceLabel} />
            </div>
            <HairlineShelf width={124} className="pro-hero-shelf" />
            {data.delta24h.count > 0 ? (
              <span className="pro-hero-delta" dir="ltr">
                {data.delta24h.amount >= 0 ? "↑" : "↓"} {ILS.format(Math.abs(data.delta24h.amount))} · {data.delta24h.count} פעולות · 24 שעות
              </span>
            ) : null}
            <div className="pro-hero-next">
              <Eyebrow>הבא בתור</Eyebrow>
              {data.upcoming[0] ? (
                <>
                  <span className="pro-hero-next-title">{data.upcoming[0].label}</span>
                  <span className="pro-hero-next-meta" dir="ltr">
                    {data.upcoming[0].direction === "in" ? "+" : "−"}
                    {ILS.format(data.upcoming[0].amount)} · {data.upcoming[0].daysLabel}
                  </span>
                </>
              ) : (
                <span className="pro-hero-next-meta">אין אירועים קרובים</span>
              )}
            </div>
          </div>

          <div className="pro-hero-right">
            <ProDonut ratio={donutRatio} tone={eomTone} />
            <Eyebrow>סוף חודש</Eyebrow>
            <span dir="ltr" className="pro-hero-eom" data-aurora-tone={eomTone}>
              {ILS.format(data.eom)}
            </span>
            <span className="pro-hero-eom-hint">
              {data.eomBudget > 0
                ? `${PCT.format(data.budgetUsedPct / 100)} · יעד ${ILS.format(data.eomBudget)}`
                : "בלי יעד"}
            </span>
          </div>
        </div>

        <div className="pro-safety-strip" aria-hidden>
          <span className="pro-safety-gradient" />
          <motion.span
            className="pro-safety-marker"
            initial={{ insetInlineStart: 0 }}
            animate={{ insetInlineStart: `${safetyMarker * 100}%` }}
            transition={{ duration: 0.9, ease: [0.32, 0.72, 0, 1] }}
          />
        </div>
      </motion.article>

      {/* Status sentence — deterministic personality line */}
      <StatusRibbon sentence={data.statusSentence} />

      {/* ── Quick actions (6 buttons) ────────────────── */}
      <div className="pro-actions-grid">
        <ActionTile
          label="הוצאה"
          onClick={() => setExpenseOpen(true)}
          variant="primary"
          icon="minus"
        />
        <ActionTile
          label="הכנסה"
          onClick={() => navigateToTab("setup", "incomes-mini-app")}
          icon="plus"
        />
        <ActionTile
          label="העברה"
          onClick={() => setWithdrawalOpen(true)}
          icon="swap"
        />
        <ActionTile
          label="משכורת"
          onClick={() => navigateToTab("setup", "incomes-mini-app")}
          icon="wallet"
        />
        <ActionTile
          label="תקציב"
          onClick={() => navigateToTab("setup", "budget-mini-app")}
          icon="target"
        />
        <ActionTile
          label="הלוואות"
          onClick={() => navigateToTab("setup", "loans-mini-app")}
          icon="loan"
        />
      </div>

      {/* ── Daily allowance ───────────────────────────── */}
      <DailyAllowanceCard data={data} onOpen={() => setSheet("daily")} />

      {/* ── Checkpoint rail ───────────────────────────── */}
      <CheckpointRail
        data={data}
        onPick={(cp) => {
          setPickedCheckpoint(cp);
          setSheet("checkpoint");
        }}
      />

      {/* ── Monthly summary ───────────────────────────── */}
      <MonthlySummary data={data} />

      {/* ── Health score gauge ───────────────────────── */}
      <HealthSection data={data} />

      {/* ── Upcoming expenses ─────────────────────────── */}
      <UpcomingSection
        data={data}
        onOpenAll={() => setSheet("upcoming")}
        onPick={(u) => {
          setPickedUpcoming(u);
          setSheet("upcomingItem");
        }}
      />

      {/* ── Upcoming income ───────────────────────────── */}
      <IncomeSection
        data={data}
        onOpenAll={() => setSheet("incomes")}
        onPick={(i) => {
          setPickedIncome(i);
          setSheet("income");
        }}
      />

      {/* ── Loans ─────────────────────────────────────── */}
      <LoansSection
        data={data}
        onOpenAll={() => setSheet("loans")}
        onPick={(l) => {
          setPickedLoan(l);
          setSheet("loan");
        }}
      />

      {/* ── Credit cards ──────────────────────────────── */}
      <CardsSection
        data={data}
        onOpenAll={() => setSheet("cards")}
        onPick={(c) => {
          setPickedCard(c);
          setSheet("card");
        }}
      />

      {/* ── Bank accounts ─────────────────────────────── */}
      <BanksSection data={data} onOpen={() => setSheet("banks")} />

      <div className="pro-chapter-break" aria-hidden />

      {/* ── Health Checks ─────────────────────────────── */}
      <HealthChecksSection checks={data.healthChecks} />

      {/* ── Monthly Activity stats ────────────────────── */}
      <MonthlyActivitySection data={data} />

      {/* ── Fixed expenses ────────────────────────────── */}
      <FixedSection
        data={data}
        onOpenAll={() => setSheet("fixed")}
        onPick={(r) => {
          setPickedFixed(r);
          setSheet("fixedItem");
        }}
        onAdd={() => navigateToTab("setup", "recurring-mini-app")}
      />

      <div className="pro-chapter-break" aria-hidden />

      {/* ── Categories ────────────────────────────────── */}
      <CategoriesSection data={data} onOpen={() => setSheet("categories")} />

      {/* ── Recent activity ───────────────────────────── */}
      <ActivitySection
        data={data}
        onOpenAll={() => setSheet("activity")}
        onPick={(r) => {
          setPickedActivity(r);
          setSheet("activityItem");
        }}
      />

      {/* ── Pending confirmations ─────────────────────── */}
      {data.pending.length > 0 ? (
        <PendingRibbon count={data.pending.length} onOpen={() => setSheet("pending")} />
      ) : null}

      {/* ── Smart insight ─────────────────────────────── */}
      {data.insight ? <InsightCard body={data.insight.body} /> : null}

      {/* ── Sheets ────────────────────────────────────── */}
      <BottomSheet
        open={sheet !== null}
        onOpenChange={(o) => (o ? null : closeSheet())}
        title={sheetTitle}
      >
        <SheetBody
          data={data}
          sheet={sheet}
          pickedCheckpoint={pickedCheckpoint}
          pickedUpcoming={pickedUpcoming}
          pickedIncome={pickedIncome}
          pickedLoan={pickedLoan}
          pickedCard={pickedCard}
          pickedActivity={pickedActivity}
          pickedFixed={pickedFixed}
          onPickUpcoming={(u) => { setPickedUpcoming(u); setSheet("upcomingItem"); }}
          onPickIncome={(i) => { setPickedIncome(i); setSheet("income"); }}
          onPickLoan={(l) => { setPickedLoan(l); setSheet("loan"); }}
          onPickCard={(c) => { setPickedCard(c); setSheet("card"); }}
          onPickActivity={(r) => { setPickedActivity(r); setSheet("activityItem"); }}
          onPickFixed={(r) => { setPickedFixed(r); setSheet("fixedItem"); }}
          onDeleteRecent={handleDeleteRecent}
          onOpenActivityEdit={() => setSheet("activityEdit")}
          onChangeCategory={handleChangeCategory}
          onConfirmPending={handleConfirmPending}
          onRejectPending={handleRejectPending}
        />
      </BottomSheet>

      <ExpenseDialog open={expenseOpen} onOpenChange={setExpenseOpen} />
      <WithdrawalDialog open={withdrawalOpen} onOpenChange={setWithdrawalOpen} />
    </div>
  );
}

// ── Atoms ─────────────────────────────────────────────────────

function ProDonut({
  ratio,
  tone,
}: {
  ratio: number;
  tone: "safe" | "watch" | "danger";
}) {
  const reduced = useReducedMotion();
  const size = 132;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(circ, circ * ratio));
  const color =
    tone === "danger"
      ? "var(--sally-danger)"
      : tone === "watch"
        ? "var(--sally-watch)"
        : "var(--sally-safe)";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        strokeDasharray={circ}
        initial={reduced ? { strokeDashoffset: circ - dash } : { strokeDashoffset: circ }}
        animate={{ strokeDashoffset: circ - dash }}
        transition={{ duration: reduced ? 0.1 : 0.9, ease: [0.32, 0.72, 0, 1] }}
      />
    </svg>
  );
}

function ActionTile({
  label,
  onClick,
  variant = "soft",
  icon,
}: {
  label: string;
  onClick: () => void;
  variant?: "primary" | "soft";
  icon: "plus" | "minus" | "swap" | "wallet" | "target" | "loan";
}) {
  return (
    <motion.button
      type="button"
      className="pro-action-tile"
      data-aurora-variant={variant}
      onClick={onClick}
      aria-label={label}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
    >
      <span aria-hidden className="pro-action-tile-icon">
        {actionGlyph(icon)}
      </span>
      <span className="pro-action-tile-label">{label}</span>
    </motion.button>
  );
}

function actionGlyph(kind: "plus" | "minus" | "swap" | "wallet" | "target" | "loan"): string {
  switch (kind) {
    case "plus": return "+";
    case "minus": return "−";
    case "swap": return "⇄";
    case "wallet": return "◈";
    case "target": return "◎";
    case "loan": return "𝅘𝅥";
  }
}

function StatusRibbon({ sentence }: { sentence: string }) {
  if (!sentence) return null;
  return (
    <div className="pro-status-ribbon">
      <span aria-hidden className="pro-status-orb" />
      <span>{sentence}</span>
    </div>
  );
}

function DailyAllowanceCard({
  data,
  onOpen,
}: {
  data: HomeData;
  onOpen: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      className="pro-daily"
      whileTap={{ scale: 0.985 }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
    >
      <div className="pro-daily-body">
        <Eyebrow accent>מותר להוציא היום</Eyebrow>
        <div className="pro-daily-amount-row">
          <span dir="ltr" className="pro-daily-amount">
            {ILS.format(data.daily.allowance)}
          </span>
          <span className="pro-daily-meta">
            הוצאת {ILS.format(data.daily.spentToday)} · {data.daily.daysRemaining} ימים
          </span>
        </div>
      </div>
      <span aria-hidden className="pro-arrow">←</span>
    </motion.button>
  );
}

function CheckpointRail({
  data,
  onPick,
}: {
  data: HomeData;
  onPick: (cp: HomeData["checkpoints"][number]) => void;
}) {
  return (
    <section className="pro-checkpoints" aria-label="נקודות זמן">
      {data.checkpoints.map((cp) => {
        const tone: "safe" | "watch" | "danger" =
          cp.state === "danger" ? "danger" : cp.state === "watch" ? "watch" : "safe";
        const active = cp.key === "live";
        return (
          <button
            key={cp.key}
            type="button"
            onClick={() => onPick(cp)}
            className="pro-checkpoint"
            data-aurora-live={active ? "true" : "false"}
          >
            <Eyebrow accent={active}>{cp.label}</Eyebrow>
            <span dir="ltr" className="pro-checkpoint-amount" data-aurora-tone={tone}>
              {cp.amount < 0 ? "−" : ""}
              {ILS.format(Math.abs(cp.amount))}
            </span>
            <span className="pro-checkpoint-meta">
              {active ? "עכשיו" : `+${cp.daysUntil} ימים`}
            </span>
          </button>
        );
      })}
    </section>
  );
}

// ── Monthly summary ───────────────────────────────────────────

function MonthlySummary({ data }: { data: HomeData }) {
  const s = data.summary;
  return (
    <section className="pro-block pro-block-highlight">
      <SectionTitle
        label="סיכום החודש"
        subtitle={
          s.savings > 0
            ? "החודש מסתמן חיובי · חיסכון פעיל."
            : s.expenses > s.income
              ? "החודש חורג · שווה לצמצם."
              : "המספרים נשמרים במאזן."
        }
      />
      <div className="pro-summary-grid">
        <SummaryCard label="הכנסה" value={s.income} accent="var(--sally-safe)" />
        <SummaryCard label="הוצאות" value={s.expenses} accent="var(--sally-ink-1)" />
        <SummaryCard label="נשאר" value={s.remaining} accent="var(--sally-gold-loud)" />
        <SummaryCard
          label="חיסכון"
          value={s.savings}
          accent="var(--sally-safe)"
          meta={
            s.savingsRate > 0 ? `${Math.round(s.savingsRate * 100)}% מההכנסה` : "—"
          }
        />
      </div>
    </section>
  );
}

function SummaryCard({
  label,
  value,
  accent,
  meta,
}: {
  label: string;
  value: number;
  accent: string;
  meta?: string;
}) {
  return (
    <div className="pro-summary-card">
      <Eyebrow>{label}</Eyebrow>
      <span dir="ltr" className="pro-summary-value" style={{ color: accent }}>
        {ILS.format(value)}
      </span>
      {meta ? <span className="pro-summary-meta">{meta}</span> : null}
    </div>
  );
}

// ── Health section ────────────────────────────────────────────

function HealthSection({ data }: { data: HomeData }) {
  const reduced = useReducedMotion();
  const size = 120;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const ratio = Math.max(0, Math.min(1, data.healthScore / 100));
  const dash = circ * ratio;
  const tone: "safe" | "watch" | "danger" =
    data.healthScore >= 75 ? "safe" : data.healthScore >= 45 ? "watch" : "danger";
  const color =
    tone === "danger"
      ? "var(--sally-danger)"
      : tone === "watch"
        ? "var(--sally-watch)"
        : "var(--sally-safe)";
  const label =
    data.healthScore >= 75
      ? "אתה בשליטה"
      : data.healthScore >= 45
        ? "יש מקום לשיפור"
        : "דורש התייחסות";
  return (
    <section>
      <SectionTitle
        label="בריאות פיננסית"
        subtitle={
          data.healthScore >= 75
            ? "התמונה יציבה · Pulse רגוע."
            : data.healthScore >= 45
              ? "יש שיפור אפשרי · כדאי להסתכל."
              : "המערכת מזהה סיכון · דורש התייחסות."
        }
      />
      <div className="pro-health">
        <div className="pro-health-gauge">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
            <motion.circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              strokeDasharray={circ}
              initial={reduced ? { strokeDashoffset: circ - dash } : { strokeDashoffset: circ }}
              animate={{ strokeDashoffset: circ - dash }}
              transition={{ duration: reduced ? 0.1 : 1, ease: [0.32, 0.72, 0, 1] }}
            />
          </svg>
          <div className="pro-health-center">
            <span dir="ltr" className="pro-health-score" style={{ color }}>
              {data.healthScore}
            </span>
            <span className="pro-health-out">/ 100</span>
          </div>
        </div>
        <div className="pro-health-body">
          <span className="pro-health-label" style={{ color }}>
            {label}
          </span>
          <p className="pro-health-hint">
            הציון משקלל את מצב סוף החודש, ניצול התקציב, ממתינות לאישור וטריות עוגני הבנק.
          </p>
        </div>
      </div>
    </section>
  );
}

// ── Upcoming Expenses ─────────────────────────────────────────

function UpcomingSection({
  data,
  onOpenAll,
  onPick,
}: {
  data: HomeData;
  onOpenAll: () => void;
  onPick: (u: HomeUpcomingRow) => void;
}) {
  return (
    <section>
      <SectionTitle
        label="החיובים הבאים"
        subtitle={
          data.upcoming.length === 0
            ? "אין אירועים מתוכננים בשבועיים הקרובים."
            : data.upcoming[0].kind === "income"
              ? `המשכורת הבאה — ${data.upcoming[0].daysLabel}.`
              : `${data.upcoming.length} אירועים בציר הזמן הקרוב.`
        }
        action={data.upcoming.length ? { label: "הכל", onClick: onOpenAll } : undefined}
      />
      {data.upcoming.length === 0 ? (
        <EmptyCard text="אין אירועים מתוכננים בשבועיים הקרובים." />
      ) : (
        <ul className="pro-timeline-list">
          {data.upcoming.slice(0, 3).map((r) => {
            const t = new Date(r.whenISO);
            return (
              <li key={r.id}>
                <button type="button" onClick={() => onPick(r)} className="pro-timeline-card">
                  <div className="pro-timeline-date">
                    <span className="pro-timeline-day">{t.getDate()}</span>
                    <span className="pro-timeline-mo">
                      {new Intl.DateTimeFormat("he-IL", { month: "short" }).format(t)}
                    </span>
                  </div>
                  <div className="pro-timeline-avatar" aria-hidden data-aurora-kind={r.kind}>
                    {kindGlyph(r.kind)}
                  </div>
                  <div className="pro-timeline-body">
                    <span className="pro-timeline-title">{r.label}</span>
                    <span className="pro-timeline-chip">
                      {kindLabel(r.kind)} · {r.daysLabel}
                    </span>
                  </div>
                  <span
                    dir="ltr"
                    className="pro-timeline-amount"
                    data-aurora-tone={r.direction === "in" ? "safe" : "ink"}
                  >
                    {r.direction === "in" ? "+" : "−"}
                    {ILS.format(r.amount)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function kindGlyph(kind: HomeUpcomingRow["kind"]): string {
  switch (kind) {
    case "income": return "₪";
    case "loan": return "𝅘𝅥";
    case "card": return "▮";
    case "bank_debit":
    default: return "○";
  }
}
function kindLabel(kind: HomeUpcomingRow["kind"]): string {
  switch (kind) {
    case "income": return "הכנסה";
    case "loan": return "הלוואה";
    case "card": return "חיוב כרטיס";
    case "bank_debit":
    default: return "חיוב בנק";
  }
}

// ── Upcoming Income ──────────────────────────────────────────

function IncomeSection({
  data,
  onOpenAll,
  onPick,
}: {
  data: HomeData;
  onOpenAll: () => void;
  onPick: (i: HomeIncomeRow) => void;
}) {
  if (data.incomes.length === 0) return null;
  return (
    <section>
      <SectionTitle
        label="הכנסות והפקדות"
        subtitle={
          data.incomes[0]
            ? data.incomes[0].daysUntil === 0
              ? "משכורת נכנסת היום."
              : `המשכורת הבאה בעוד ${data.incomes[0].daysUntil} ימים.`
            : "אין הכנסות חוזרות מוגדרות."
        }
        action={{ label: "הכל", onClick: onOpenAll }}
      />
      <ul className="pro-income-cards">
        {data.incomes.slice(0, 3).map((inc) => {
          const total = 30;
          const progress = Math.max(0.02, Math.min(1, (30 - Math.min(30, inc.daysUntil)) / total));
          return (
            <li key={inc.id}>
              <button type="button" onClick={() => onPick(inc)} className="pro-income-card">
                <div className="pro-income-card-head">
                  <div>
                    <span className="pro-income-card-label">{inc.label}</span>
                    <span className="pro-income-card-meta">
                      {inc.daysUntil === 0 ? "היום" : `בעוד ${inc.daysUntil} ימים · יום ${inc.dayOfMonth}`}
                    </span>
                  </div>
                  <span dir="ltr" className="pro-income-card-amount">
                    +{ILS.format(inc.amount)}
                  </span>
                </div>
                <div className="pro-income-card-bar" aria-hidden>
                  <motion.span
                    className="pro-income-card-bar-fill"
                    initial={{ width: `${progress * 100}%` }}
                    animate={{ width: `${progress * 100}%` }}
                    transition={{ duration: 0.9, ease: [0.32, 0.72, 0, 1] }}
                  />
                </div>
                <div className="pro-income-card-foot">
                  <span className="pro-income-confidence">
                    <span aria-hidden className="pro-income-confidence-dot" />
                    הפקדה קבועה
                  </span>
                  <span dir="ltr">{DATE_FMT.format(new Date(inc.nextChargeISO))}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── Loans ────────────────────────────────────────────────────

function LoansSection({
  data,
  onOpenAll,
  onPick,
}: {
  data: HomeData;
  onOpenAll: () => void;
  onPick: (l: HomeLoanRow) => void;
}) {
  if (data.loans.length === 0) return null;
  return (
    <section>
      <SectionTitle
        label="הלוואות פעילות"
        subtitle={
          data.loans.some((l) => l.status === "ending-soon")
            ? "אחת ההלוואות מתקרבת לסיום."
            : `${data.loans.length} הלוואות בציר הזמן.`
        }
        action={{ label: "הכל", onClick: onOpenAll }}
      />
      <ul className="pro-loan-cards">
        {data.loans.slice(0, 3).map((loan) => (
          <li key={loan.id}>
            <button type="button" onClick={() => onPick(loan)} className="pro-loan-card">
              <div className="pro-loan-card-head">
                <div className="pro-loan-avatar" aria-hidden>◐</div>
                <div className="pro-loan-title-block">
                  <span className="pro-loan-title">{loan.label}</span>
                  <span className="pro-loan-hint" dir="ltr">
                    {ILS.format(loan.monthlyAmount)}/חודש · {DAY_MO_FMT.format(new Date(loan.nextChargeISO))}
                  </span>
                </div>
                <span
                  className="pro-loan-status"
                  data-aurora-tone={
                    loan.status === "ending-soon" ? "safe" : loan.status === "starting-soon" ? "watch" : "neutral"
                  }
                >
                  {loan.status === "ending-soon" ? "מתקרבת לסיום" : loan.status === "starting-soon" ? "מתחילה" : "פעילה"}
                </span>
              </div>
              <div className="pro-loan-progress">
                <motion.span
                  className="pro-loan-progress-fill"
                  initial={{ width: `${loan.progress * 100}%` }}
                  animate={{ width: `${loan.progress * 100}%` }}
                  transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
                />
              </div>
              <div className="pro-loan-foot">
                <span dir="ltr">
                  {loan.totalPayments && loan.remainingPayments !== undefined
                    ? `${loan.totalPayments - loan.remainingPayments} / ${loan.totalPayments}`
                    : "פעילה"}
                </span>
                <span dir="ltr">{Math.round(loan.progress * 100)}%</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Cards ────────────────────────────────────────────────────

function CardsSection({
  data,
  onOpenAll,
  onPick,
}: {
  data: HomeData;
  onOpenAll: () => void;
  onPick: (c: HomeCardRow) => void;
}) {
  if (data.cards.length === 0) return null;
  return (
    <section>
      <SectionTitle
        label="כרטיסי אשראי"
        subtitle={
          data.cards.some((c) => (c.utilisation ?? 0) >= 0.85)
            ? "אחד הכרטיסים בניצול גבוה."
            : "החיוב החודשי בשליטה."
        }
        action={{ label: "הכל", onClick: onOpenAll }}
      />
      <div className="pro-card-carousel" role="list">
        {data.cards.map((c) => {
          const utilRatio = c.utilisation ?? 0;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick(c)}
              className="pro-card-tile"
              style={{
                background: `linear-gradient(135deg, ${c.color ?? "#7BA9FF"}30, rgba(255,255,255,0.02) 80%)`,
                borderColor: `${c.color ?? "#7BA9FF"}55`,
              }}
              role="listitem"
            >
              <div className="pro-card-tile-head">
                <Eyebrow accent>{c.label}</Eyebrow>
                <span dir="ltr" className="pro-card-tile-last4">
                  ****{c.cardLast4 ?? "----"}
                </span>
              </div>
              <div className="pro-card-tile-metric">
                <span dir="ltr" className="pro-card-tile-current">
                  {ILS.format(c.currentTotal)}
                </span>
                <span className="pro-card-tile-hint">
                  הבא {ILS.format(c.nextTotal)}
                </span>
              </div>
              {c.creditLimit ? (
                <CardUtilRadial ratio={utilRatio} />
              ) : (
                <div className="pro-card-tile-nolimit">בלי מסגרת מוגדרת</div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CardUtilRadial({ ratio }: { ratio: number }) {
  const reduced = useReducedMotion();
  const size = 48;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * ratio;
  const color =
    ratio >= 0.85
      ? "var(--sally-danger)"
      : ratio >= 0.55
        ? "var(--sally-watch)"
        : "var(--sally-safe)";
  return (
    <div className="pro-card-util">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          strokeDasharray={circ}
          initial={reduced ? { strokeDashoffset: circ - dash } : { strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - dash }}
          transition={{ duration: reduced ? 0.1 : 0.8, ease: [0.32, 0.72, 0, 1] }}
        />
      </svg>
      <div>
        <span dir="ltr" className="pro-card-util-pct" style={{ color }}>
          {Math.round(ratio * 100)}%
        </span>
        <span className="pro-card-util-hint">ניצול</span>
      </div>
    </div>
  );
}

// ── Banks ────────────────────────────────────────────────────

function BanksSection({ data, onOpen }: { data: HomeData; onOpen: () => void }) {
  if (data.banks.length === 0) return null;
  const total = data.banks.reduce((s, r) => s + r.anchorBalance, 0);
  return (
    <section>
      <SectionTitle
        label="חשבונות בנק"
        subtitle="היתרה החיה שמזינה את החיזוי."
        endValue={ILS.format(total)}
      />
      <ul className="pro-bank-cards">
        {data.banks.map((b) => (
          <li key={b.id}>
            <button type="button" onClick={onOpen} className="pro-bank-card">
              <div className="pro-bank-logo" aria-hidden>{initialsOf(b.label)}</div>
              <div className="pro-bank-body">
                <span className="pro-bank-label">{b.label}</span>
                <span className="pro-bank-hint">
                  {b.anchorUpdatedAt
                    ? `עודכן ${DATE_FMT.format(new Date(b.anchorUpdatedAt))}`
                    : "עוגן ראשוני"}
                </span>
              </div>
              <span
                dir="ltr"
                className="pro-bank-balance"
                data-aurora-tone={b.anchorBalance < 0 ? "danger" : "ink"}
              >
                {ILS.format(b.anchorBalance)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function initialsOf(label: string): string {
  const trimmed = (label ?? "").trim();
  if (!trimmed) return "•";
  const words = trimmed.split(/\s+/).filter(Boolean);
  const first = words[0] ?? trimmed;
  // Grab first character. Slice(0,1) works for BMP glyphs (Hebrew is
  // BMP so this is fine); guard against emoji surrogate pairs.
  return Array.from(first)[0] ?? "•";
}

// ── Fixed expenses ───────────────────────────────────────────

function FixedSection({
  data,
  onOpenAll,
  onPick,
  onAdd,
}: {
  data: HomeData;
  onOpenAll: () => void;
  onPick: (r: HomeRule) => void;
  onAdd: () => void;
}) {
  if (data.fixed.length === 0) {
    return (
      <section>
        <SectionTitle label="חיובים קבועים" />
        <EmptyCard
          text="עדיין לא הוגדרו חיובים קבועים החודש."
          actionLabel="הוסף חיוב קבוע"
          onAction={onAdd}
        />
      </section>
    );
  }
  const total = data.fixed.reduce((s, r) => s + r.estimatedAmount, 0);
  return (
    <section>
      <SectionTitle
        label="חיובים קבועים"
        subtitle={
          data.fixed.some((r) => r.status !== "paid")
            ? "חלק מהחיובים עדיין לא הופיעו החודש."
            : "כל החיובים הקבועים כבר עברו החודש."
        }
        action={{ label: "הכל", onClick: onOpenAll }}
        endValue={ILS.format(total)}
      />
      <ul className="pro-fixed-list">
        {data.fixed.slice(0, 4).map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => onPick(r)} className="pro-fixed-row">
              <div className="pro-fixed-avatar" aria-hidden>◇</div>
              <div className="pro-fixed-body">
                <span className="pro-fixed-title">{r.label}</span>
                <span className="pro-fixed-hint">
                  {catLabel(r.category)} · יום {r.dayOfMonth} · {DAY_MO_FMT.format(new Date(r.nextChargeISO))}
                </span>
              </div>
              <span
                className="pro-fixed-badge"
                data-aurora-tone={r.status === "paid" ? "safe" : "watch"}
              >
                {r.status === "paid" ? "שולם" : "ממתין"}
              </span>
              <span dir="ltr" className="pro-fixed-amount">
                {ILS.format(r.estimatedAmount)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function catLabel(id: string): string {
  try {
    return getCategory(id as CategoryId).label;
  } catch {
    return id;
  }
}

// ── Categories ──────────────────────────────────────────────

function CategoriesSection({ data, onOpen }: { data: HomeData; onOpen: () => void }) {
  if (data.categories.length === 0) return null;
  const total = data.categories.reduce((s, c) => s + c.amount, 0);
  return (
    <section>
      <SectionTitle
        label="לאן הולך הכסף"
        subtitle={
          data.categories[0]
            ? `${data.categories[0].label} מובילה החודש · ${ILS.format(data.categories[0].amount)}.`
            : "עדיין אין חלוקה משמעותית."
        }
        action={{ label: "הכל", onClick: onOpen }}
        endValue={ILS.format(total)}
      />
      <ul className="pro-cat-list">
        {data.categories.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={onOpen} className="pro-cat-row">
              <span aria-hidden className="pro-cat-dot" style={{ background: c.color }} />
              <div className="pro-cat-body">
                <div className="pro-cat-head">
                  <span className="pro-cat-label">{c.label}</span>
                  <span dir="ltr" className="pro-cat-amount">
                    {ILS.format(c.amount)}
                  </span>
                </div>
                <div className="pro-cat-bar" aria-hidden>
                  <motion.span
                    className="pro-cat-bar-fill"
                    style={{
                      background: `linear-gradient(90deg, ${c.color}, ${c.color}88)`,
                    }}
                    initial={{ width: 0 }}
                    animate={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          (c.amount /
                            Math.max(1, data.categories[0]?.amount ?? 1)) *
                            100,
                        ),
                      )}%`,
                    }}
                    transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
                  />
                </div>
                <div className="pro-cat-foot">
                  <span>{c.merchantCount} עסקים</span>
                  <span dir="ltr" data-aurora-tone={c.deltaPct === null ? "neutral" : c.deltaPct >= 25 ? "watch" : c.deltaPct <= -15 ? "safe" : "neutral"}>
                    {c.deltaPct === null || Math.abs(Math.round(c.deltaPct)) < 1
                      ? "יציב"
                      : `${c.deltaPct > 0 ? "↑" : "↓"} ${Math.abs(Math.round(c.deltaPct))}%`}
                  </span>
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Activity ────────────────────────────────────────────────

function ActivitySection({
  data,
  onOpenAll,
  onPick,
}: {
  data: HomeData;
  onOpenAll: () => void;
  onPick: (r: HomeActivityRow) => void;
}) {
  return (
    <section>
      <SectionTitle
        label="פעולות אחרונות"
        subtitle={
          data.recent[0]
            ? `${data.recent[0].label} · ${data.recent[0].metaLabel}.`
            : "עדיין אין תנועות החודש."
        }
        action={{ label: "הכל", onClick: onOpenAll }}
      />
      {data.recent.length === 0 ? (
        <EmptyCard text="אין פעולות שנרשמו החודש." />
      ) : (
        <ul className="pro-activity-list">
          {data.recent.slice(0, 4).map((r) => {
            const initial = initialsOf(r.label ?? "");
            return (
              <li key={r.id}>
                <button type="button" onClick={() => onPick(r)} className="pro-activity-row">
                  <div className="pro-activity-avatar" aria-hidden>
                    {initial}
                  </div>
                  <div className="pro-activity-body">
                    <span className="pro-activity-title">{r.label}</span>
                    <span className="pro-activity-meta">{r.metaLabel}</span>
                  </div>
                  <span
                    dir="ltr"
                    className="pro-activity-amount"
                    data-aurora-tone={r.direction === "in" ? "safe" : "ink"}
                  >
                    {r.direction === "in" ? "+" : "−"}
                    {ILS.format(r.amount)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ── Pending ridbon ──────────────────────────────────────────

function PendingRibbon({
  count,
  onOpen,
}: {
  count: number;
  onOpen: () => void;
}) {
  return (
    <button type="button" onClick={onOpen} className="pro-pending-ribbon">
      <span aria-hidden className="pro-pending-ribbon-dot" />
      <span className="pro-pending-ribbon-label">
        {count} עסקאות ממתינות לאישור
      </span>
      <span aria-hidden className="pro-arrow">←</span>
    </button>
  );
}

// ── Insight ─────────────────────────────────────────────────

function InsightCard({ body }: { body: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <button type="button" onClick={() => setExpanded((v) => !v)} className="pro-insight">
      <Eyebrow accent>תובנה</Eyebrow>
      <p
        className={`pro-insight-body${expanded ? " pro-insight-body-expanded" : ""}`}
      >
        {body}
      </p>
      <span className="pro-insight-toggle">
        {expanded ? "סגור" : "קרא עוד"} ←
      </span>
    </button>
  );
}

// ── Health Checks ───────────────────────────────────────────

function HealthChecksSection({ checks }: { checks: HomeHealthCheck[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  return (
    <section>
      <SectionTitle
        label="בדיקות בריאות"
        subtitle="מבט מהיר על השכבות מסביב לתזרים."
      />
      <ul className="pro-health-list">
        {checks.map((c) => {
          const isOpen = openKey === c.key;
          const tone = c.status;
          return (
            <li key={c.key}>
              <button
                type="button"
                onClick={() => setOpenKey((p) => (p === c.key ? null : c.key))}
                aria-expanded={isOpen}
                className="pro-health-row"
              >
                <span
                  aria-hidden
                  className="pro-health-dot"
                  data-aurora-tone={tone}
                />
                <div className="pro-health-row-body">
                  <div className="pro-health-row-head">
                    <span className="pro-health-row-title">{c.label}</span>
                    <span
                      className="pro-health-row-status"
                      data-aurora-tone={tone}
                    >
                      {c.statusLabel}
                    </span>
                  </div>
                  <motion.span
                    className="pro-health-row-hint"
                    initial={false}
                    animate={{ opacity: isOpen ? 1 : 0.65, height: "auto" }}
                    transition={{ duration: 0.25 }}
                  >
                    {c.hint}
                  </motion.span>
                </div>
                <motion.span
                  aria-hidden
                  className="pro-health-arrow"
                  animate={{ rotate: isOpen ? 90 : 0 }}
                  transition={{ type: "spring", stiffness: 380, damping: 34 }}
                >
                  ▸
                </motion.span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── Monthly Activity ────────────────────────────────────────

function MonthlyActivitySection({ data }: { data: HomeData }) {
  const s = data.activityStats;
  return (
    <section>
      <SectionTitle
        label="פעילות החודש"
        subtitle={
          s.transactions === 0
            ? "עדיין לא נרשמו תנועות."
            : `${s.transactions} תנועות עד עכשיו החודש.`
        }
      />
      <div className="pro-activity-stats">
        <StatBlock label="עסקאות" value={String(s.transactions)} />
        <StatBlock label="הוצאות החודש" value={ILS.format(s.monthlyExpenses)} accent="var(--sally-ink-1)" />
        <StatBlock label="הכנסות החודש" value={ILS.format(s.monthlyIncome)} accent="var(--sally-safe)" />
      </div>
      <div className="pro-activity-stats">
        <StatBlock
          label="חיוב הכי גדול"
          value={s.largestExpense ? ILS.format(s.largestExpense.amount) : "—"}
          meta={s.largestExpense?.label ?? "אין"}
        />
        <StatBlock
          label="עסקה אחרונה"
          value={s.lastTransaction ? ILS.format(s.lastTransaction.amount) : "—"}
          meta={s.lastTransaction?.metaLabel ?? "—"}
        />
        <StatBlock
          label="עסק מוביל"
          value={s.topMerchant?.label ?? "—"}
          meta={s.topMerchant ? `${s.topMerchant.count} פעמים` : "אין"}
          textOnly
        />
      </div>
    </section>
  );
}

function StatBlock({
  label,
  value,
  meta,
  accent,
  textOnly,
}: {
  label: string;
  value: string;
  meta?: string;
  accent?: string;
  textOnly?: boolean;
}) {
  return (
    <div className="pro-stat">
      <Eyebrow>{label}</Eyebrow>
      <span
        dir={textOnly ? "rtl" : "ltr"}
        className="pro-stat-value"
        style={{ color: accent ?? "var(--sally-ink-1)" }}
      >
        {value}
      </span>
      {meta ? <span className="pro-stat-meta">{meta}</span> : null}
    </div>
  );
}

// ── Section title primitive ─────────────────────────────────

function SectionTitle({
  label,
  subtitle,
  action,
  endValue,
}: {
  label: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
  endValue?: string;
}) {
  return (
    <header className="pro-section-title-block">
      <div className="pro-section-title-line">
        <Eyebrow>{label}</Eyebrow>
        <div className="pro-section-title-end">
          {endValue ? (
            <span dir="ltr" className="pro-section-title-value">
              {endValue}
            </span>
          ) : null}
          {action ? (
            <button
              type="button"
              className="sally-ghost-link"
              onClick={action.onClick}
              aria-label={`${label} · ${action.label}`}
            >
              {action.label}
            </button>
          ) : null}
        </div>
      </div>
      {subtitle ? <span className="pro-section-subtitle">{subtitle}</span> : null}
    </header>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="pro-empty-line">{text}</p>;
}

function EmptyCard({
  text,
  actionLabel,
  onAction,
}: {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="pro-empty-card">
      <span aria-hidden className="pro-empty-orb" />
      <p className="pro-empty-text">{text}</p>
      {actionLabel && onAction ? (
        <button type="button" className="pro-empty-action" onClick={onAction}>
          {actionLabel} ←
        </button>
      ) : null}
    </div>
  );
}

// ── SheetBody ───────────────────────────────────────────────

function SheetBody({
  data,
  sheet,
  pickedCheckpoint,
  pickedUpcoming,
  pickedIncome,
  pickedLoan,
  pickedCard,
  pickedActivity,
  pickedFixed,
  onPickUpcoming,
  onPickIncome,
  onPickLoan,
  onPickCard,
  onPickActivity,
  onPickFixed,
  onDeleteRecent,
  onOpenActivityEdit,
  onChangeCategory,
  onConfirmPending,
  onRejectPending,
}: {
  data: HomeData;
  sheet: SheetKind;
  pickedCheckpoint: HomeData["checkpoints"][number] | null;
  pickedUpcoming: HomeUpcomingRow | null;
  pickedIncome: HomeIncomeRow | null;
  pickedLoan: HomeLoanRow | null;
  pickedCard: HomeCardRow | null;
  pickedActivity: HomeActivityRow | null;
  pickedFixed: HomeRule | null;
  onPickUpcoming: (u: HomeUpcomingRow) => void;
  onPickIncome: (i: HomeIncomeRow) => void;
  onPickLoan: (l: HomeLoanRow) => void;
  onPickCard: (c: HomeCardRow) => void;
  onPickActivity: (a: HomeActivityRow) => void;
  onPickFixed: (r: HomeRule) => void;
  onDeleteRecent: () => void;
  onOpenActivityEdit: () => void;
  onChangeCategory: (id: CategoryId) => void;
  onConfirmPending: (row: HomePendingRow) => void;
  onRejectPending: (row: HomePendingRow) => void;
}) {
  if (!sheet) return null;

  if (sheet === "hero") {
    return (
      <SheetStack>
        <FactList
          rows={[
            ["יתרה חיה", ILS.format(data.live)],
            ["צפי סוף החודש", ILS.format(data.eom)],
            ["יעד חודשי", data.eomBudget > 0 ? ILS.format(data.eomBudget) : "—"],
            ["מצב", data.safetyLabel],
            ["ציון בריאות", `${data.healthScore} / 100`],
          ]}
        />
      </SheetStack>
    );
  }
  if (sheet === "daily") {
    return (
      <SheetStack>
        <FactList
          rows={[
            ["מותר להוציא היום", ILS.format(data.daily.allowance)],
            ["הוצאת היום", ILS.format(data.daily.spentToday)],
            ["ימים שנותרו", `${data.daily.daysRemaining}`],
          ]}
        />
        <SheetNote>הסכום מחושב לפי מנוע התחזית של סאלי — תקציב פחות הוצאות ופחות תשלומים עתידיים, מחולק לימים שנותרו.</SheetNote>
      </SheetStack>
    );
  }
  if (sheet === "checkpoint" && pickedCheckpoint) {
    return (
      <SheetStack>
        <FactList
          rows={[
            ["יתרה צפויה", `${pickedCheckpoint.amount < 0 ? "−" : ""}${ILS.format(Math.abs(pickedCheckpoint.amount))}`],
            ["מתי", DATE_FMT.format(new Date(pickedCheckpoint.whenISO))],
            ["ימים", pickedCheckpoint.daysUntil === 0 ? "עכשיו" : `+${pickedCheckpoint.daysUntil}`],
          ]}
        />
      </SheetStack>
    );
  }
  if (sheet === "upcoming") {
    return (
      <SheetStack>
        <SheetList
          rows={data.upcoming.map((u) => ({
            key: u.id,
            title: u.label,
            meta: u.daysLabel,
            amount: `${u.direction === "in" ? "+" : "−"}${ILS.format(u.amount)}`,
            tone: u.direction === "in" ? "safe" : "ink",
            onClick: () => onPickUpcoming(u),
          }))}
        />
      </SheetStack>
    );
  }
  if (sheet === "upcomingItem" && pickedUpcoming) {
    return (
      <SheetStack>
        <FactList
          rows={[
            ["סכום", `${pickedUpcoming.direction === "in" ? "+" : "−"}${ILS.format(pickedUpcoming.amount)}`],
            ["מתי", DATE_FMT.format(new Date(pickedUpcoming.whenISO))],
            ["סוג", kindLabel(pickedUpcoming.kind)],
          ]}
        />
      </SheetStack>
    );
  }
  if (sheet === "incomes") {
    return (
      <SheetStack>
        <SheetList
          rows={data.incomes.map((i) => ({
            key: i.id,
            title: i.label,
            meta: i.daysUntil === 0 ? "היום" : `בעוד ${i.daysUntil} ימים`,
            amount: `+${ILS.format(i.amount)}`,
            tone: "safe",
            onClick: () => onPickIncome(i),
          }))}
        />
      </SheetStack>
    );
  }
  if (sheet === "income" && pickedIncome) {
    return (
      <SheetStack>
        <FactList
          rows={[
            ["סכום", ILS.format(pickedIncome.amount)],
            ["יום בחודש", `${pickedIncome.dayOfMonth}`],
            ["הפקדה הבאה", DATE_FMT.format(new Date(pickedIncome.nextChargeISO))],
            ["ימים", pickedIncome.daysUntil === 0 ? "היום" : `בעוד ${pickedIncome.daysUntil} ימים`],
          ]}
        />
        <SheetNote>עריכה מלאה של הכנסות זמינה במסך ההגדרות הקיים (מיני-אפ הכנסות). המנוע ממשיך לחשב אותה בציר הזמן.</SheetNote>
      </SheetStack>
    );
  }
  if (sheet === "loans") {
    return (
      <SheetStack>
        <SheetList
          rows={data.loans.map((l) => ({
            key: l.id,
            title: l.label,
            meta: `${ILS.format(l.monthlyAmount)}/חודש`,
            amount:
              l.totalPayments && l.remainingPayments !== undefined
                ? `${l.totalPayments - l.remainingPayments}/${l.totalPayments}`
                : "פעילה",
            tone: "ink",
            onClick: () => onPickLoan(l),
          }))}
        />
      </SheetStack>
    );
  }
  if (sheet === "loan" && pickedLoan) {
    return (
      <SheetStack>
        <FactList
          rows={[
            ["חיוב חודשי", ILS.format(pickedLoan.monthlyAmount)],
            [
              "התקדמות",
              pickedLoan.totalPayments && pickedLoan.remainingPayments !== undefined
                ? `${pickedLoan.totalPayments - pickedLoan.remainingPayments}/${pickedLoan.totalPayments} (${Math.round(pickedLoan.progress * 100)}%)`
                : "—",
            ],
            ["חיוב הבא", DATE_FMT.format(new Date(pickedLoan.nextChargeISO))],
            [
              "סטטוס",
              pickedLoan.status === "ending-soon"
                ? "מתקרבת לסיום"
                : pickedLoan.status === "starting-soon"
                  ? "מתחילה בקרוב"
                  : "פעילה",
            ],
          ]}
        />
      </SheetStack>
    );
  }
  if (sheet === "cards") {
    return (
      <SheetStack>
        <SheetList
          rows={data.cards.map((c) => ({
            key: c.id,
            title: c.label,
            meta: `****${c.cardLast4 ?? "----"} · הבא ${ILS.format(c.nextTotal)}`,
            amount: ILS.format(c.currentTotal),
            tone: "ink",
            onClick: () => onPickCard(c),
          }))}
        />
      </SheetStack>
    );
  }
  if (sheet === "card" && pickedCard) {
    return (
      <SheetStack>
        <FactList
          rows={[
            ["חיוב החודש", ILS.format(pickedCard.currentTotal)],
            ["חיוב הבא", ILS.format(pickedCard.nextTotal)],
            ["4 ספרות אחרונות", pickedCard.cardLast4 ? `****${pickedCard.cardLast4}` : "—"],
            ["מסגרת אשראי", pickedCard.creditLimit ? ILS.format(pickedCard.creditLimit) : "—"],
            [
              "ניצול",
              pickedCard.utilisation !== undefined
                ? `${Math.round(pickedCard.utilisation * 100)}%`
                : "—",
            ],
            ["מספר עסקאות", `${pickedCard.transactionCount}`],
          ]}
        />
      </SheetStack>
    );
  }
  if (sheet === "banks") {
    return (
      <SheetStack>
        <SheetList
          rows={data.banks.map((b) => ({
            key: b.id,
            title: b.label,
            meta: b.anchorUpdatedAt
              ? `עודכן ${DATE_FMT.format(new Date(b.anchorUpdatedAt))}`
              : "עוגן ראשוני",
            amount: ILS.format(b.anchorBalance),
            tone: b.anchorBalance < 0 ? "danger" : "ink",
            onClick: () => {},
          }))}
        />
      </SheetStack>
    );
  }
  if (sheet === "categories") {
    return (
      <SheetStack>
        <SheetList
          rows={data.categories.map((c) => ({
            key: String(c.id),
            title: c.label,
            meta: `${c.merchantCount} עסקים · ${c.deltaPct === null || Math.abs(Math.round(c.deltaPct)) < 1 ? "יציב" : `${c.deltaPct > 0 ? "↑" : "↓"} ${Math.abs(Math.round(c.deltaPct))}%`}`,
            amount: ILS.format(c.amount),
            tone: "ink",
            onClick: () => {},
          }))}
        />
      </SheetStack>
    );
  }
  if (sheet === "activity") {
    return (
      <SheetStack>
        <SheetList
          rows={data.recent.map((r) => ({
            key: r.id,
            title: r.label,
            meta: r.metaLabel,
            amount: `${r.direction === "in" ? "+" : "−"}${ILS.format(r.amount)}`,
            tone: r.direction === "in" ? "safe" : "ink",
            onClick: () => onPickActivity(r),
          }))}
        />
      </SheetStack>
    );
  }
  if (sheet === "activityItem" && pickedActivity) {
    return (
      <SheetStack>
        <FactList
          rows={[
            ["שם", pickedActivity.label],
            ["סכום", `${pickedActivity.direction === "in" ? "+" : "−"}${ILS.format(pickedActivity.amount)}`],
            ["מתי", DATE_FMT.format(new Date(pickedActivity.whenISO))],
          ]}
        />
        <div className="pro-sheet-actions">
          <button type="button" className="pro-detail-action" data-aurora-variant="primary" onClick={onOpenActivityEdit}>
            שנה קטגוריה
          </button>
          <button type="button" className="pro-detail-action" data-aurora-variant="danger" onClick={onDeleteRecent}>
            מחק פעולה
          </button>
        </div>
      </SheetStack>
    );
  }
  if (sheet === "activityEdit") {
    return (
      <SheetStack>
        <ul className="pro-cat-picker">
          {CATEGORIES.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onChangeCategory(c.id)}
                className="pro-cat-picker-item"
              >
                <span aria-hidden className="pro-cat-picker-dot" style={{ background: c.accent }} />
                <span>{c.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </SheetStack>
    );
  }
  if (sheet === "pending") {
    return (
      <SheetStack>
        <ul className="sally-list">
          {data.pending.map((row) => (
            <li key={row.id}>
              <div className="pro-pending-row">
                <div className="pro-pending-text">
                  <span className="pro-pending-title">{row.label}</span>
                  <span className="pro-pending-hint">
                    {row.reason} · {DATE_FMT.format(new Date(row.whenISO))}
                  </span>
                </div>
                <span dir="ltr" className="pro-pending-amount">
                  {ILS.format(row.amount)}
                </span>
                <div className="pro-pending-buttons">
                  <button
                    type="button"
                    aria-label="אשר"
                    className="pro-pending-btn"
                    data-aurora-variant="approve"
                    onClick={() => onConfirmPending(row)}
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    aria-label="דחה"
                    className="pro-pending-btn"
                    data-aurora-variant="reject"
                    onClick={() => onRejectPending(row)}
                  >
                    ×
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </SheetStack>
    );
  }
  if (sheet === "fixed") {
    return (
      <SheetStack>
        <SheetList
          rows={data.fixed.map((r) => ({
            key: r.id,
            title: r.label,
            meta: `${catLabel(r.category)} · יום ${r.dayOfMonth}${r.paid ? " · שולם" : ""}`,
            amount: ILS.format(r.estimatedAmount),
            tone: "ink",
            onClick: () => onPickFixed(r),
          }))}
        />
      </SheetStack>
    );
  }
  if (sheet === "fixedItem" && pickedFixed) {
    return (
      <SheetStack>
        <FactList
          rows={[
            ["קטגוריה", catLabel(pickedFixed.category)],
            ["יום החיוב", `${pickedFixed.dayOfMonth}`],
            ["חיוב הבא", DATE_FMT.format(new Date(pickedFixed.nextChargeISO))],
            ["סכום צפוי", ILS.format(pickedFixed.estimatedAmount)],
            ["סטטוס", pickedFixed.status === "paid" ? "שולם החודש" : "ממתין"],
          ]}
        />
        <SheetNote>עריכה מלאה של חיוב קבוע זמינה במסך ההגדרות הקיים (מיני-אפ חיובים חוזרים).</SheetNote>
      </SheetStack>
    );
  }
  return null;
}

// ── Sheet primitives ────────────────────────────────────────

function SheetStack({ children }: { children: React.ReactNode }) {
  return <div className="pro-sheet-stack">{children}</div>;
}
function SheetNote({ children }: { children: React.ReactNode }) {
  return <p className="pro-sheet-note">{children}</p>;
}
function FactList({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="pro-sheet-list">
      {rows.map(([label, value], i) => (
        <div key={`${label}-${i}`} className="pro-sheet-row">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
function SheetList({
  rows,
}: {
  rows: Array<{
    key: string;
    title: string;
    meta: string;
    amount: string;
    tone: "safe" | "danger" | "watch" | "ink";
    onClick: () => void;
  }>;
}) {
  return (
    <ul className="pro-sheet-rows">
      {rows.map((r) => (
        <li key={r.key}>
          <button
            type="button"
            onClick={r.onClick}
            aria-label={`${r.title} · ${r.amount}`}
            className="pro-sheet-row-btn"
          >
            <div className="pro-sheet-row-body">
              <span className="pro-sheet-row-title">{r.title}</span>
              <span className="pro-sheet-row-meta">{r.meta}</span>
            </div>
            <span
              dir="ltr"
              className="pro-sheet-row-amount"
              data-aurora-tone={r.tone}
            >
              {r.amount}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
