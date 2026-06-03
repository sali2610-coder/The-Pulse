"use client";

// Phase 239+240 — "איך חישבנו?" transparency panel.
//
// Renders the same math as HeroFutureBalanceCard, but breaks the
// signed deltas into the five categories called out in the brief.
// Collapsed by default — power-user verification surface, not the
// primary read. When the engine deliberately skipped pending
// entries (bankPending / needsConfirmation without confirmedAt) we
// surface a transparent warning so the user knows why a charge
// they expect isn't in the figure.

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Banknote,
  ChevronDown,
  CreditCard,
  HandCoins,
  Landmark,
  Receipt,
  Wallet,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import {
  buildFutureBalanceBreakdown,
  type ForecastItem,
  type ForecastItemKind,
  type FutureBalanceBreakdown,
} from "@/lib/future-balance-explain";
import { tap } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

export function FutureBalanceExplain({ offset }: { offset: number }) {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);

  const [open, setOpen] = useState(false);

  const data = useMemo<FutureBalanceBreakdown | null>(() => {
    if (!hydrated) return null;
    return buildFutureBalanceBreakdown({
      accounts,
      loans,
      incomes,
      rules,
      statuses,
      entries,
      offset,
      windowDays: 60,
    });
  }, [hydrated, accounts, loans, incomes, rules, statuses, entries, offset]);

  if (!data) return null;
  const hasAnchors = accounts.some(
    (a) => a.active && a.kind === "bank" && typeof a.anchorBalance === "number",
  );
  if (!hasAnchors) return null;

  function toggle() {
    setOpen((v) => !v);
    tap();
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-white/8 bg-black/25">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start transition-colors hover:bg-white/3"
      >
        <span className="text-section text-foreground">מה השתנה עד התאריך</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-muted-foreground"
        >
          <ChevronDown className="size-5" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-white/8"
          >
            <div className="flex flex-col gap-2 p-4">
              <p className="text-caption text-muted-foreground">
                מה השתנה מהיום עד{" "}
                <span dir="rtl">
                  {DAY_FMT.format(new Date(data.whenISO))}
                </span>
                . רק פעולות שעדיין צפויות להיכנס או לרדת.
              </p>

              <Row
                icon={<Banknote className="size-4" />}
                tone="info"
                label="יתרת בנק נוכחית"
                value={data.startingBalance}
                sign="="
              />
              {/* Phase 345 — only show non-zero Δ rows so the
                 breakdown reflects what actually happens in the
                 selected window. A 0₪ row would read as "loans don't
                 exist" when really they just don't fire in this Δ. */}
              {data.deltaIncome > 0 ? (
                <Row
                  icon={<Wallet className="size-4" />}
                  tone="ok"
                  label="הכנסות שייכנסו עד התאריך"
                  value={data.deltaIncome}
                  sign="+"
                />
              ) : null}
              {data.deltaCreditCards > 0 ? (
                <Row
                  icon={<CreditCard className="size-4" />}
                  tone="danger"
                  label="חיובי אשראי שירדו עד התאריך"
                  value={data.deltaCreditCards}
                  sign="−"
                />
              ) : null}
              {data.deltaBankFixedCharges > 0 ? (
                <Row
                  icon={<Landmark className="size-4" />}
                  tone="danger"
                  label="חיובי בנק קבועים עד התאריך"
                  value={data.deltaBankFixedCharges}
                  sign="−"
                />
              ) : null}
              {data.deltaLoans > 0 ? (
                <Row
                  icon={<HandCoins className="size-4" />}
                  tone="danger"
                  label="הלוואות שירדו עד התאריך"
                  value={data.deltaLoans}
                  sign="−"
                />
              ) : null}
              {data.deltaManualExpenses > 0 ? (
                <Row
                  icon={<Receipt className="size-4" />}
                  tone="danger"
                  label="הוצאות ידניות מתוזמנות"
                  value={data.deltaManualExpenses}
                  sign="−"
                />
              ) : null}

              {data.includedItems.length === 0 ? (
                <p className="rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-caption text-muted-foreground">
                  אין פעולות צפויות בטווח הזה. היתרה נשארת זהה.
                </p>
              ) : null}

              <div className="mt-2 flex items-baseline justify-between gap-2 rounded-xl border border-white/12 bg-black/40 px-3 py-2.5">
                <span className="text-section text-foreground">צפי סופי</span>
                <span
                  data-mono="true"
                  dir="ltr"
                  className="text-section"
                  style={{
                    color:
                      data.finalBalance < 0
                        ? "#F87171"
                        : data.finalBalance < 500
                          ? "#F59E0B"
                          : "#34D399",
                  }}
                >
                  {data.finalBalance < 0 ? "−" : ""}
                  {ILS.format(Math.abs(Math.round(data.finalBalance)))}
                </span>
              </div>

              {/* Per-event timeline. Sorted by event date so the user
                 reads exactly what happens, in order. */}
              {data.includedItems.length > 0 ? (
                <ItemsList items={data.includedItems} />
              ) : null}

              {data.excludedPendingCount > 0 ? (
                <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-caption font-medium text-amber-400">
                      {data.excludedPendingCount} חיובים תלויים ועומדים לא
                      נספרו (
                      <span dir="ltr">
                        {ILS.format(Math.round(data.excludedPendingTotal))}
                      </span>
                      )
                    </span>
                    <span className="text-caption text-muted-foreground">
                      חיובי SMS שעדיין &quot;תלוי ועומד&quot; או הוצאות
                      Wallet שעוד לא אישרת — Pulse מחכה לאישור לפני
                      שמוסיף אותם לתחזית.
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

const ITEM_KIND_META: Record<
  ForecastItemKind,
  { label: string; tone: "ok" | "danger" | "info"; sign: "+" | "−" }
> = {
  income: { label: "הכנסה", tone: "ok", sign: "+" },
  credit: { label: "אשראי", tone: "danger", sign: "−" },
  bank_fixed: { label: "חיוב בנק", tone: "danger", sign: "−" },
  loan: { label: "הלוואה", tone: "danger", sign: "−" },
  manual_expense: { label: "ידנית", tone: "danger", sign: "−" },
};

const ITEM_DATE_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
});

function ItemsList({ items }: { items: ForecastItem[] }) {
  const ILS_FMT = new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  });
  return (
    <section className="mt-1 flex flex-col gap-1.5 rounded-xl border border-white/8 bg-black/20 p-2">
      <span className="px-2 pt-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
        פעולות בטווח · {items.length}
      </span>
      <ul className="flex flex-col gap-0.5">
        {items.map((it, i) => {
          const meta = ITEM_KIND_META[it.kind];
          const color =
            meta.tone === "ok"
              ? "#34D399"
              : meta.tone === "danger"
                ? "#F87171"
                : "#60A5FA";
          // Phase 347 — for credit items the transaction day and the
          // bank-impact day differ; surface both ("עסקה: DD.MM /
          // יורד מהבנק: DD.MM"). For every other kind the two dates
          // are equal so render a single line.
          const tx = new Date(it.transactionDateISO);
          const impact = new Date(it.bankImpactDateISO);
          const datesDiffer =
            it.transactionDateISO !== it.bankImpactDateISO;
          return (
            <li
              key={`${it.bankImpactDateISO}-${it.kind}-${i}`}
              className="flex flex-col gap-1 rounded-lg px-2 py-1.5"
            >
              <div className="flex items-center justify-between gap-2 text-[11.5px]">
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span
                    className="shrink-0 rounded-md px-1.5 py-0.5 text-[9.5px] font-medium"
                    style={{ background: `${color}22`, color }}
                  >
                    {meta.label}
                  </span>
                  <span className="truncate text-foreground/90">{it.label}</span>
                </div>
                <span
                  data-mono="true"
                  dir="ltr"
                  className="font-medium"
                  style={{ color }}
                >
                  {meta.sign}
                  {ILS_FMT.format(Math.round(it.amount))}
                </span>
              </div>
              <div
                className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground/75"
                dir="ltr"
                data-mono="true"
              >
                {datesDiffer ? (
                  <>
                    <span>עסקה: {ITEM_DATE_FMT.format(tx)}</span>
                    <span>יורד מהבנק: {ITEM_DATE_FMT.format(impact)}</span>
                  </>
                ) : (
                  <span>{ITEM_DATE_FMT.format(impact)}</span>
                )}
                {it.cardLabel ? (
                  <span dir="rtl" className="text-muted-foreground/85">
                    מקור: {it.cardLabel}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Row({
  icon,
  tone,
  label,
  value,
  sign,
}: {
  icon: React.ReactNode;
  tone: "ok" | "danger" | "info";
  label: string;
  value: number;
  sign: "+" | "−" | "=";
}) {
  const color =
    tone === "danger" ? "#F87171" : tone === "ok" ? "#34D399" : "#60A5FA";
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span
          className="flex size-7 items-center justify-center rounded-lg"
          style={{ background: `${color}22`, color }}
        >
          {icon}
        </span>
        <span className="text-body text-foreground">{label}</span>
      </div>
      <span
        data-mono="true"
        dir="ltr"
        className="text-body"
        style={{ color: sign === "−" ? "#F87171" : tone === "ok" ? "#34D399" : undefined }}
      >
        {sign === "=" ? "" : sign}
        {ILS.format(Math.round(value))}
      </span>
    </div>
  );
}
