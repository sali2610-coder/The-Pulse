"use client";

// Income · premium 4-tile launcher for Home "הכנסות" section.
//
// Closed: four compact touch tiles in a 2×2 grid. Each tile shows a
// smart summary — one headline + one sub-line. Tap → inline lens
// with a SHORT (never long) info card that answers exactly the tile's
// question. Baseline edits open the shared IncomeFullScreenEdit,
// one-off month overrides route through store.setIncomeActual —
// both preexisting. Zero engine / calculation / API / model change.

import { useMemo, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  CalendarClock,
  CheckCircle2,
  Pencil,
  Wallet,
} from "lucide-react";

import { IncomeFullScreenEdit } from "@/components/income/income-fullscreen-edit";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useFinanceStore } from "@/lib/store";
import { addMonths, currentMonthKey } from "@/lib/dates";
import { incomeForMonth } from "@/lib/income-month";
import { tap as hapticTap, success as hapticSuccess } from "@/lib/haptics";
import type { Income } from "@/types/finance";

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

type Lens = "expected" | "next" | "received" | "edit" | null;

export function IncomeLauncher() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const incomes = useFinanceStore((s) => s.incomes);

  const [lens, setLens] = useState<Lens>(null);
  const [editingIncomeId, setEditingIncomeId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [overrideIncomeId, setOverrideIncomeId] = useState<string | null>(null);
  const [overrideMonthKey, setOverrideMonthKey] = useState<string>(
    currentMonthKey(),
  );
  const [overrideOpen, setOverrideOpen] = useState(false);

  const monthKey = currentMonthKey();
  const nextMonthKey = addMonths(monthKey, 1);

  const active = useMemo(
    () =>
      incomes
        .filter((i) => i.active)
        .slice()
        .sort((a, b) => a.dayOfMonth - b.dayOfMonth),
    [incomes],
  );

  const expectedThisMonth = useMemo(
    () => active.reduce((s, i) => s + incomeForMonth(i, monthKey), 0),
    [active, monthKey],
  );
  const receivedThisMonth = useMemo(() => {
    const today = new Date().getDate();
    let sum = 0;
    for (const i of active) {
      if (i.dayOfMonth <= today) sum += incomeForMonth(i, monthKey);
    }
    return sum;
  }, [active, monthKey]);
  const upcoming = useMemo(
    () => collectUpcoming(active, monthKey, nextMonthKey, 3),
    [active, monthKey, nextMonthKey],
  );
  const nextInfo = upcoming[0] ?? null;

  if (!hydrated) return <div className="ob-skeleton" aria-hidden />;
  if (active.length === 0) return <EmptyState />;

  function toggleLens(next: Lens) {
    hapticTap();
    setLens((prev) => (prev === next ? null : next));
  }
  function openBaselineEditor(id: string | null) {
    hapticTap();
    setEditingIncomeId(id);
    setEditorOpen(true);
  }
  function openOverrideEditor(id: string, mk: string) {
    hapticTap();
    setOverrideIncomeId(id);
    setOverrideMonthKey(mk);
    setOverrideOpen(true);
  }

  const ratio =
    expectedThisMonth > 0
      ? Math.max(0, Math.min(1, receivedThisMonth / expectedThisMonth))
      : 0;

  return (
    <div className="ob-dashboard" data-lens-open={lens ?? undefined} dir="rtl">
      <div className="ob-launcher-grid">
        <LauncherTile
          eyebrow="צפוי החודש"
          headline={ILS.format(Math.round(expectedThisMonth))}
          sub={`${active.length} ${active.length === 1 ? "משכורת" : "משכורות"}`}
          tone="safe"
          glyph={<Wallet className="size-4" />}
          active={lens === "expected"}
          dimmed={lens !== null && lens !== "expected"}
          onClick={() => toggleLens("expected")}
        />
        <LauncherTile
          eyebrow="הקרובה"
          headline={nextInfo ? DATE_FMT.format(nextInfo.date) : "—"}
          sub={nextInfo ? ILS.format(Math.round(nextInfo.amount)) : "אין"}
          tone="gold"
          glyph={<CalendarClock className="size-4" />}
          active={lens === "next"}
          dimmed={lens !== null && lens !== "next"}
          onClick={() => toggleLens("next")}
        />
        <LauncherTile
          eyebrow="נכנס עד היום"
          headline={ILS.format(Math.round(receivedThisMonth))}
          sub={`${Math.round(ratio * 100)}% מהצפוי`}
          tone="cyan"
          glyph={<CheckCircle2 className="size-4" />}
          active={lens === "received"}
          dimmed={lens !== null && lens !== "received"}
          onClick={() => toggleLens("received")}
        />
        <LauncherTile
          eyebrow="עריכת משכורות"
          headline={String(active.length)}
          sub="פעילות"
          tone="purple"
          glyph={<Pencil className="size-4" />}
          active={lens === "edit"}
          dimmed={lens !== null && lens !== "edit"}
          onClick={() => toggleLens("edit")}
        />
      </div>

      <AnimatePresence initial={false} mode="wait">
        {lens === "expected" ? (
          <ExpectedLens
            key="expected"
            incomes={active}
            monthKey={monthKey}
            total={expectedThisMonth}
          />
        ) : null}
        {lens === "next" ? (
          <NextLens key="next" upcoming={upcoming} />
        ) : null}
        {lens === "received" ? (
          <ReceivedLens
            key="received"
            incomes={active}
            monthKey={monthKey}
            received={receivedThisMonth}
            expected={expectedThisMonth}
          />
        ) : null}
        {lens === "edit" ? (
          <EditLens
            key="edit"
            incomes={active}
            monthKey={monthKey}
            nextMonthKey={nextMonthKey}
            onEditBaseline={openBaselineEditor}
            onOverrideCurrent={(id) => openOverrideEditor(id, monthKey)}
            onOverrideNext={(id) => openOverrideEditor(id, nextMonthKey)}
          />
        ) : null}
      </AnimatePresence>

      <IncomeFullScreenEdit
        incomeId={editingIncomeId}
        open={editorOpen}
        onOpenChange={(o) => {
          setEditorOpen(o);
          if (!o) setEditingIncomeId(null);
        }}
      />

      <OverrideSheet
        open={overrideOpen}
        onOpenChange={(o) => {
          setOverrideOpen(o);
          if (!o) setOverrideIncomeId(null);
        }}
        incomeId={overrideIncomeId}
        monthKey={overrideMonthKey}
      />
    </div>
  );
}

// ── Launcher tile ────────────────────────────────────────

function LauncherTile({
  eyebrow,
  headline,
  sub,
  tone,
  glyph,
  active,
  dimmed,
  onClick,
}: {
  eyebrow: string;
  headline: string;
  sub: string;
  tone: "purple" | "cyan" | "safe" | "watch" | "gold";
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
        {sub}
      </span>
    </motion.button>
  );
}

// ── Lens frame ───────────────────────────────────────────

function LensFrame({
  eyebrow,
  right,
  children,
}: {
  eyebrow: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.section
      layout
      className="ob-lens"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
      transition={{
        type: "spring",
        stiffness: 320,
        damping: 30,
        duration: reduced ? 0.12 : undefined,
      }}
    >
      <header className="ob-lens-head">
        <span className="ob-lens-eyebrow">{eyebrow}</span>
        {right}
      </header>
      {children}
    </motion.section>
  );
}

// ── Expected lens (compact per-income list, capped at 5) ─

function ExpectedLens({
  incomes,
  monthKey,
  total,
}: {
  incomes: Income[];
  monthKey: string;
  total: number;
}) {
  const visible = incomes.slice(0, 5);
  const more = Math.max(0, incomes.length - visible.length);
  return (
    <LensFrame
      eyebrow="משכורות צפויות החודש"
      right={
        <span className="ob-lens-total" data-mono="true" dir="ltr">
          {ILS.format(Math.round(total))}
        </span>
      }
    >
      <ul className="il-mini-list">
        {visible.map((inc) => {
          const amt = incomeForMonth(inc, monthKey);
          const overridden = inc.actualByMonth?.[monthKey] !== undefined;
          return (
            <li key={inc.id} className="il-mini-row">
              <span aria-hidden className="il-mini-rail" />
              <div className="il-mini-body">
                <span className="il-mini-title">{inc.label}</span>
                <span className="il-mini-meta">
                  ב-{inc.dayOfMonth} בחודש
                  {overridden ? " · חד-פעמי" : ""}
                </span>
              </div>
              <span className="il-mini-amount" data-mono="true" dir="ltr">
                {ILS.format(Math.round(amt))}
              </span>
            </li>
          );
        })}
      </ul>
      {more > 0 ? (
        <div className="il-mini-more">+ עוד {more}</div>
      ) : null}
    </LensFrame>
  );
}

// ── Next lens (max 3 upcoming) ───────────────────────────

function NextLens({
  upcoming,
}: {
  upcoming: Array<{ income: Income; amount: number; date: Date }>;
}) {
  return (
    <LensFrame eyebrow="הכנסות בדרך">
      {upcoming.length === 0 ? (
        <div className="ob-empty">אין הכנסה קרובה בטווח.</div>
      ) : (
        <ul className="ob-timeline">
          {upcoming.map((r, i) => (
            <li
              key={`${r.income.id}-${i}`}
              className="ob-timeline-row"
              data-kind="rule"
            >
              <span aria-hidden className="ob-timeline-dot" />
              <div className="ob-timeline-body">
                <span
                  className="ob-timeline-date"
                  data-mono="true"
                  dir="ltr"
                >
                  {DATE_FMT_LONG.format(r.date)}
                </span>
                <span className="ob-timeline-label">
                  {r.income.label}
                </span>
              </div>
              <span
                className="ob-timeline-amount"
                data-mono="true"
                dir="ltr"
              >
                {ILS.format(Math.round(r.amount))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </LensFrame>
  );
}

// ── Received lens (compact list w/ diff) ────────────────

function ReceivedLens({
  incomes,
  monthKey,
  received,
  expected,
}: {
  incomes: Income[];
  monthKey: string;
  received: number;
  expected: number;
}) {
  const today = new Date().getDate();
  const rows = incomes
    .filter((i) => i.dayOfMonth <= today)
    .slice(0, 5);
  return (
    <LensFrame
      eyebrow="מה נכנס עד היום"
      right={
        <span className="ob-lens-total" data-mono="true" dir="ltr">
          {ILS.format(Math.round(received))} / {ILS.format(Math.round(expected))}
        </span>
      }
    >
      {rows.length === 0 ? (
        <div className="ob-empty">עוד לא נכנסה משכורת החודש.</div>
      ) : (
        <ul className="il-mini-list">
          {rows.map((inc) => {
            const amt = incomeForMonth(inc, monthKey);
            const diff = amt - inc.amount;
            const overridden = inc.actualByMonth?.[monthKey] !== undefined;
            return (
              <li key={inc.id} className="il-mini-row">
                <span aria-hidden className="il-mini-rail" data-tone="safe" />
                <div className="il-mini-body">
                  <span className="il-mini-title">
                    {inc.label}
                    {overridden ? (
                      <span className="il-mini-badge">חד-פעמי</span>
                    ) : null}
                  </span>
                  <span className="il-mini-meta">
                    התקבל ב-{inc.dayOfMonth}
                  </span>
                </div>
                <div className="il-mini-amount-wrap">
                  <span
                    className="il-mini-amount"
                    data-mono="true"
                    dir="ltr"
                  >
                    {ILS.format(Math.round(amt))}
                  </span>
                  {diff !== 0 ? (
                    <span
                      className="il-mini-diff"
                      data-tone={diff > 0 ? "safe" : "watch"}
                      data-mono="true"
                      dir="ltr"
                    >
                      {diff > 0 ? "+" : "−"}
                      {ILS.format(Math.round(Math.abs(diff)))}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </LensFrame>
  );
}

// ── Edit lens (short — max 3 incomes; scroll if more) ───

function EditLens({
  incomes,
  monthKey,
  nextMonthKey,
  onEditBaseline,
  onOverrideCurrent,
  onOverrideNext,
}: {
  incomes: Income[];
  monthKey: string;
  nextMonthKey: string;
  onEditBaseline: (id: string) => void;
  onOverrideCurrent: (id: string) => void;
  onOverrideNext: (id: string) => void;
}) {
  return (
    <LensFrame eyebrow="ערוך משכורות">
      <ul className="il-edit-list">
        {incomes.map((inc) => {
          const currentAmt = incomeForMonth(inc, monthKey);
          const nextAmt = incomeForMonth(inc, nextMonthKey);
          const overriddenCurrent =
            inc.actualByMonth?.[monthKey] !== undefined;
          const overriddenNext =
            inc.actualByMonth?.[nextMonthKey] !== undefined;
          return (
            <li key={inc.id} className="il-edit-row">
              <div className="il-edit-head">
                <div className="il-edit-titles">
                  <span className="il-edit-title">{inc.label}</span>
                  <span className="il-edit-meta">
                    בסיס: {ILS.format(inc.amount)} · יום {inc.dayOfMonth}
                  </span>
                </div>
                <button
                  type="button"
                  className="il-edit-baseline"
                  onClick={() => onEditBaseline(inc.id)}
                  aria-label={`ערוך משכורת ${inc.label}`}
                >
                  <Pencil className="size-3.5" />
                  ערוך משכורת
                </button>
              </div>
              <div className="il-edit-months">
                <button
                  type="button"
                  className="il-edit-month"
                  onClick={() => onOverrideCurrent(inc.id)}
                  data-overridden={overriddenCurrent ? "true" : undefined}
                >
                  <span className="il-edit-month-label">חודש נוכחי</span>
                  <span
                    className="il-edit-month-value"
                    data-mono="true"
                    dir="ltr"
                  >
                    {ILS.format(Math.round(currentAmt))}
                  </span>
                  <span className="il-edit-month-hint">
                    {overriddenCurrent
                      ? "חד-פעמי · הקש לעדכון"
                      : "עדכן לחודש הזה"}
                  </span>
                </button>
                <button
                  type="button"
                  className="il-edit-month"
                  onClick={() => onOverrideNext(inc.id)}
                  data-overridden={overriddenNext ? "true" : undefined}
                >
                  <span className="il-edit-month-label">חודש הבא</span>
                  <span
                    className="il-edit-month-value"
                    data-mono="true"
                    dir="ltr"
                  >
                    {ILS.format(Math.round(nextAmt))}
                  </span>
                  <span className="il-edit-month-hint">
                    {overriddenNext
                      ? "חד-פעמי · הקש לעדכון"
                      : "שמור שינוי חד-פעמי"}
                  </span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </LensFrame>
  );
}

// ── Override sheet ───────────────────────────────────────

function OverrideSheet({
  open,
  onOpenChange,
  incomeId,
  monthKey,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  incomeId: string | null;
  monthKey: string;
}) {
  const income = useFinanceStore((s) =>
    incomeId ? s.incomes.find((i) => i.id === incomeId) ?? null : null,
  );
  const setIncomeActual = useFinanceStore((s) => s.setIncomeActual);
  const currentAmt = income ? incomeForMonth(income, monthKey) : 0;
  const overridden = income?.actualByMonth?.[monthKey] !== undefined;
  const initialValue = useMemo(
    () => (income ? String(Math.round(currentAmt)) : ""),
    [income, currentAmt],
  );
  const [draft, setDraft] = useState<string>(initialValue);

  return (
    <BottomSheet
      key={`${incomeId}-${monthKey}`}
      open={open}
      onOpenChange={(o) => {
        if (o) setDraft(initialValue);
        onOpenChange(o);
      }}
      title={income ? `עדכון ${income.label}` : "עדכון הכנסה"}
      className="il-sheet"
    >
      {income ? (
        <div className="il-sheet-body">
          <span className="il-sheet-eyebrow">
            {formatMonth(monthKey)} · {income.label}
          </span>
          <label className="il-sheet-field">
            <span className="il-sheet-field-label">כמה נכנס בפועל?</span>
            <input
              type="text"
              inputMode="decimal"
              className="il-sheet-input"
              value={draft || initialValue}
              onChange={(e) => setDraft(e.target.value)}
              dir="ltr"
              data-mono="true"
            />
          </label>
          <div className="il-sheet-tip">
            שינוי משפיע רק על החודש הזה. חודש הבא חוזר לבסיס{" "}
            {ILS.format(income.amount)}.
          </div>
          <div className="il-sheet-actions">
            {overridden ? (
              <button
                type="button"
                className="il-sheet-btn il-sheet-btn-ghost"
                onClick={() => {
                  setIncomeActual(income.id, monthKey, null);
                  hapticSuccess();
                  onOpenChange(false);
                }}
              >
                בטל שינוי חד-פעמי
              </button>
            ) : null}
            <button
              type="button"
              className="il-sheet-btn il-sheet-btn-primary"
              onClick={() => {
                const val = Number(
                  (draft || initialValue).replace(/[^\d.-]/g, ""),
                );
                if (Number.isFinite(val) && val >= 0) {
                  setIncomeActual(
                    income.id,
                    monthKey,
                    val === income.amount ? null : val,
                  );
                  hapticSuccess();
                }
                onOpenChange(false);
              }}
            >
              שמור שינוי חד-פעמי
            </button>
          </div>
        </div>
      ) : (
        <div />
      )}
    </BottomSheet>
  );
}

// ── Empty ────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="ob-empty-hero" dir="rtl">
      <span aria-hidden className="ob-empty-orb" />
      <span className="ob-empty-title">אין הכנסות פעילות</span>
      <span className="ob-empty-hint">
        הגדר משכורת או הכנסה חוזרת בפרופיל כדי לראות תמונת מצב חיה.
      </span>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────

function collectUpcoming(
  incomes: Income[],
  currentMK: string,
  nextMK: string,
  limit: number,
): Array<{ income: Income; amount: number; date: Date }> {
  const today = new Date().getDate();
  const [cY, cM] = mkParts(currentMK);
  const [nY, nM] = mkParts(nextMK);
  const list: Array<{ income: Income; amount: number; date: Date }> = [];
  for (const inc of incomes) {
    if (inc.dayOfMonth >= today) {
      list.push({
        income: inc,
        amount: incomeForMonth(inc, currentMK),
        date: new Date(cY, cM - 1, inc.dayOfMonth),
      });
    }
    list.push({
      income: inc,
      amount: incomeForMonth(inc, nextMK),
      date: new Date(nY, nM - 1, inc.dayOfMonth),
    });
  }
  list.sort((a, b) => a.date.getTime() - b.date.getTime());
  return list.slice(0, limit);
}

function mkParts(mk: string): [number, number] {
  const [y, m] = mk.split("-").map((x) => Number(x));
  return [y, m];
}

function formatMonth(mk: string): string {
  const [y, m] = mkParts(mk);
  const d = new Date(y, m - 1, 1);
  return new Intl.DateTimeFormat("he-IL", {
    month: "long",
    year: "numeric",
  }).format(d);
}
