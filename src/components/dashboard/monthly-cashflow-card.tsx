"use client";

// Phase 268 — month-first cashflow card.
//
// Same data the cashflow buckets card surfaces, regrouped into one
// folder per month. Inside each folder: per-source groups (income /
// bank / cards / loans), expandable. Default-open for current +
// next month, default-closed for further months — matches the
// brief.

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Banknote,
  CalendarRange,
  ChevronDown,
  CreditCard,
  HandCoins,
  Landmark,
  Wallet,
} from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import {
  buildMonthlyCashflow,
  type MonthlyCashflowFolder,
  type MonthlySourceGroup,
} from "@/lib/monthly-cashflow";
import { SectionHeader } from "@/components/ui/section-header";
import { CardEmpty } from "@/components/ui/card-empty";
import { tap } from "@/lib/haptics";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "short",
});

const TONE_COLOR: Record<MonthlyCashflowFolder["tone"], string> = {
  current: "#34D399",
  next: "#60A5FA",
  future: "#A78BFA",
};

const SOURCE_ICON: Record<MonthlySourceGroup["source"], React.ReactNode> = {
  income: <Wallet className="size-4" />,
  bank_debit: <Landmark className="size-4" />,
  card: <CreditCard className="size-4" />,
  loan: <HandCoins className="size-4" />,
};

const SOURCE_TONE: Record<MonthlySourceGroup["source"], string> = {
  income: "#34D399",
  bank_debit: "#60A5FA",
  card: "#A78BFA",
  loan: "#F87171",
};

export function MonthlyCashflowCard({
  windowDays = 90,
  title = "תזרים חודשי לפי תיקיות",
}: {
  windowDays?: number;
  title?: string;
}) {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const accounts = useFinanceStore((s) => s.accounts);
  const loans = useFinanceStore((s) => s.loans);
  const incomes = useFinanceStore((s) => s.incomes);
  const rules = useFinanceStore((s) => s.rules);
  const statuses = useFinanceStore((s) => s.statuses);
  const entries = useFinanceStore((s) => s.entries);

  const folders = useMemo(() => {
    if (!hydrated) return [];
    return buildMonthlyCashflow({
      accounts,
      loans,
      incomes,
      rules,
      statuses,
      entries,
      windowDays,
    });
  }, [hydrated, accounts, loans, incomes, rules, statuses, entries, windowDays]);

  if (!hydrated) return null;
  if (folders.length === 0) {
    return (
      <section className="glass-card flex flex-col gap-3 rounded-3xl p-5">
        <SectionHeader icon={<CalendarRange />} title={title} />
        <CardEmpty
          icon={<CalendarRange className="size-4" />}
          title="אין עדיין תזרים עתידי"
          reason="הוסף הוצאות קבועות, הלוואות, או הכנסה צפויה כדי לראות חלוקה לחודשים."
        />
      </section>
    );
  }

  const grandIncome = folders.reduce((acc, f) => acc + f.totalIncome, 0);
  const grandExpense = folders.reduce((acc, f) => acc + f.totalExpense, 0);
  const grandNet = grandIncome - grandExpense;

  return <MonthlyCashflowBody
    title={title}
    windowDays={windowDays}
    folders={folders}
    grandIncome={grandIncome}
    grandExpense={grandExpense}
    grandNet={grandNet}
  />;
}

function MonthlyCashflowBody({
  title,
  windowDays,
  folders,
  grandIncome,
  grandExpense,
  grandNet,
}: {
  title: string;
  windowDays: number;
  folders: MonthlyCashflowFolder[];
  grandIncome: number;
  grandExpense: number;
  grandNet: number;
}) {
  // Phase 291 — single open month at a time. Default closed.
  const [openKey, setOpenKey] = useState<string | null>(null);
  const openFolder = folders.find((f) => f.monthKey === openKey) ?? null;

  return (
    <section className="glass-card flex flex-col gap-3 rounded-3xl p-5">
      <SectionHeader
        icon={<CalendarRange />}
        title={title}
        trailing={
          <span className="text-caption text-muted-foreground" dir="ltr">
            סה״כ {windowDays} ימים
          </span>
        }
      />
      <p className="text-caption text-muted-foreground">
        כל חודש בנפרד. בכל תיקייה הכנסות, חיובי בנק, כרטיסים והלוואות.
      </p>

      <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/8 bg-black/25 p-3">
        <Stat
          label={`הכנסות ${windowDays} ימים`}
          value={`+${ILS.format(Math.round(grandIncome))}`}
          tone="#34D399"
        />
        <Stat
          label={`יציאות ${windowDays} ימים`}
          value={`−${ILS.format(Math.round(grandExpense))}`}
          tone="#F87171"
        />
        <Stat
          label={`נטו ${windowDays} ימים`}
          value={`${grandNet < 0 ? "−" : "+"}${ILS.format(
            Math.abs(Math.round(grandNet)),
          )}`}
          tone={grandNet < 0 ? "#F87171" : "#34D399"}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {folders.map((folder) => (
          <MonthButton
            key={folder.monthKey}
            folder={folder}
            active={openKey === folder.monthKey}
            onClick={() => {
              tap();
              setOpenKey(
                openKey === folder.monthKey ? null : folder.monthKey,
              );
            }}
          />
        ))}
      </div>

      <AnimatePresence initial={false} mode="wait">
        {openFolder ? (
          <motion.div
            key={openFolder.monthKey}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <FolderBody folder={openFolder} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function MonthButton({
  folder,
  active,
  onClick,
}: {
  folder: MonthlyCashflowFolder;
  active: boolean;
  onClick: () => void;
}) {
  const color = TONE_COLOR[folder.tone];
  const tierLabel =
    folder.tone === "current"
      ? "חודש נוכחי"
      : folder.tone === "next"
        ? "החודש הבא"
        : "חודש עתידי";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${active ? "סגור" : "פתח"} ${folder.fullLabel} · ${tierLabel}`}
      title={`${active ? "סגור" : "פתח"} ${folder.fullLabel}`}
      className={`relative flex flex-col gap-1 overflow-hidden rounded-2xl border px-3 py-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60 ${
        active
          ? "bg-black/40"
          : "bg-black/25 hover:bg-white/3"
      }`}
      style={{
        borderColor: active ? `${color}66` : "rgba(255,255,255,0.08)",
        boxShadow: active
          ? `0 16px 40px -22px ${color}66, inset 0 1px 0 rgba(255,255,255,0.06)`
          : undefined,
        background: active
          ? `linear-gradient(180deg, ${color}1f 0%, rgba(0,0,0,0.35) 80%)`
          : undefined,
      }}
    >
      <span
        className="text-[11px] uppercase tracking-[0.18em]"
        style={{ color }}
      >
        {tierLabel}
      </span>
      <span className="text-section text-foreground leading-tight">
        {folder.fullLabel}
      </span>
      <span
        data-mono="true"
        dir="ltr"
        className="text-caption"
        style={{ color: folder.net < 0 ? "#F87171" : "#34D399" }}
      >
        {folder.net < 0 ? "−" : "+"}
        {ILS.format(Math.abs(Math.round(folder.net)))}
      </span>
    </button>
  );
}

function FolderBody({ folder }: { folder: MonthlyCashflowFolder }) {
  return (
    <div className="flex flex-col gap-3 pt-3">
      <div className="grid grid-cols-2 gap-2">
        <Stat
          label="הכנסות"
          value={`+${ILS.format(Math.round(folder.totalIncome))}`}
          tone="#34D399"
        />
        <Stat
          label="יציאות"
          value={`−${ILS.format(Math.round(folder.totalExpense))}`}
          tone="#F87171"
        />
      </div>

      <ul className="flex flex-col gap-1.5">
        {(["income", "card", "bank_debit", "loan"] as const).map(
          (source, idx) => {
            const group = folder.bySource[source];
            if (group.total === 0) return null;
            return (
              <motion.div
                key={source}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: Math.min(idx * 0.05, 0.2),
                  duration: 0.22,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <SourceRow group={group} isInflow={source === "income"} />
              </motion.div>
            );
          },
        )}
      </ul>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-micro text-muted-foreground">{label}</span>
      <span
        data-mono="true"
        dir="ltr"
        className="text-body font-medium"
        style={{ color: tone }}
      >
        {value}
      </span>
    </div>
  );
}

function SourceRow({
  group,
  isInflow,
}: {
  group: MonthlySourceGroup;
  isInflow: boolean;
}) {
  const [open, setOpen] = useState(false);
  const tone = SOURCE_TONE[group.source];
  const sign = isInflow ? "+" : "−";
  return (
    <li className="overflow-hidden rounded-xl border border-white/6 bg-black/15">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          tap();
        }}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-start hover:bg-white/3"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-lg"
            style={{ background: `${tone}22`, color: tone }}
          >
            {SOURCE_ICON[group.source]}
          </span>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="text-body text-foreground">{group.label}</span>
            <span className="text-caption text-muted-foreground">
              {group.events.length} פעולות
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            data-mono="true"
            dir="ltr"
            className="text-body font-medium"
            style={{ color: tone }}
          >
            {sign}
            {ILS.format(Math.round(group.total))}
          </span>
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.18 }}
            className="text-muted-foreground"
          >
            <ChevronDown className="size-4" />
          </motion.span>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.ul
            key="items"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden border-t border-white/6"
          >
            {group.events.map((ev, i) => (
              <li
                key={`${ev.refId}-${i}`}
                className="flex items-baseline justify-between gap-2 px-4 py-2"
              >
                <div className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-caption text-foreground">
                    {ev.label}
                  </span>
                  <span className="text-caption text-muted-foreground/80">
                    {DAY_FMT.format(new Date(ev.effectiveCashAt))}
                  </span>
                </div>
                <span
                  data-mono="true"
                  dir="ltr"
                  className="text-caption font-medium"
                  style={{ color: tone }}
                >
                  {sign}
                  {ILS.format(Math.round(ev.amount))}
                </span>
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

void Banknote;
