"use client";

// Phase 429 — Quiet Concierge sections for the Home tab.
//
// Each section reads from useHomeData() and renders pure primitives.
// No store mutations. No engine math. No icons on closed surfaces.
// Sections answer the 3-second test:
//   1. How much do I have?      → HeroSection
//   2. Am I safe?               → HeroSection (EOM + state) + TodaySection (allowance)
//   3. What's next?             → NextEventRow (always visible)
//   4. What changed?            → Delta24hRow (always visible)
//   5. What needs attention?    → PendingPill (only when count > 0)

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  BreathingCaret,
  ConciergeSentence,
  DigitOdometer,
  EmptyDash,
  Eyebrow,
  GhostCta,
  GoldPill,
  HomeHeading,
  LedgerRow,
  NeonAccent,
  SectionAir,
  SpringDrawer,
} from "./primitives";
import { useHomeData, type HomeData } from "./use-home-data";
import { money, relativeDay, shortDate } from "./format";
import { navigateToTab } from "@/lib/tab-nav";
import { openAttentionCenter } from "@/lib/use-attention-center";
import { ExpenseDialog } from "@/components/expense-form/expense-dialog";
import { WithdrawalDialog } from "@/components/expense-form/withdrawal-dialog";

// ── HeroSection ─────────────────────────────────────────────────────
//
// Live bank balance (56px) + Neon caret breathing under it.
// Below, EOM forecast (40px) + Gold state word.
// No card, no chrome. One column. The first ≤3 seconds.

export function HeroSection({ data }: { data: HomeData }) {
  if (!data.ready) return <HeroSkeleton />;
  if (!data.hasAnchors) return <HeroEmpty />;

  return (
    <section
      className="flex flex-col items-center text-center"
      style={{ paddingBlockStart: "1.5rem" }}
    >
      <HomeHeading level={1}>מסך הבית של Pulse</HomeHeading>
      <Eyebrow>יתרה חיה · LIVE</Eyebrow>
      {/* Phase 429 review-fix: ONE composite live region for both
         numbers + safety state. Prevents iOS VoiceOver from
         double-announcing on every digit tick. Visual odometers
         are aria-hidden via DigitOdometer. */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        יתרה נוכחית {money(data.livBalance)} · צפי לסוף החודש {money(data.eomForecast)} · {data.safetyLabel}
      </span>
      <div
        dir="ltr"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--type-hero)",
          color: "var(--ink-primary)",
          fontWeight: 300,
          letterSpacing: "var(--tracking-hero)",
          lineHeight: 1,
          marginBlockStart: "0.875rem",
        }}
      >
        <DigitOdometer
          value={money(data.livBalance)}
          ariaLabel={`יתרה ${money(data.livBalance)}`}
        />
      </div>
      <BreathingCaret width={96} />
      <div style={{ marginBlockStart: "1.5rem" }}>
        <Eyebrow>סוף החודש</Eyebrow>
        <div
          dir="ltr"
          style={{
            fontSize: "var(--type-eom)",
            color: "var(--ink-body)",
            fontWeight: 300,
            letterSpacing: "var(--tracking-hero)",
            lineHeight: 1.1,
            marginBlockStart: "0.5rem",
          }}
        >
          <DigitOdometer value={money(data.eomForecast)} />
        </div>
        {/* Soft variant — the loud Gold is reserved for the dedicated
           ConciergeNoteSection so the page never shows two loud
           Gold sentences at once. */}
        <div style={{ marginBlockStart: "0.625rem" }}>
          <ConciergeSentence variant="soft">
            {data.safetyState === "stress" ? (
              <span style={{ color: "var(--lane-danger)" }}>
                {data.safetyLabel}
              </span>
            ) : (
              data.safetyLabel
            )}
            {data.eomBudget > 0 ? ` · יעד ${money(data.eomBudget)}` : ""}
          </ConciergeSentence>
        </div>
      </div>
    </section>
  );
}

function HeroSkeleton() {
  return (
    <section className="flex flex-col items-center text-center" style={{ paddingBlockStart: "1.5rem" }}>
      <Eyebrow>יתרה חיה · LIVE</Eyebrow>
      <div
        dir="ltr"
        aria-hidden
        style={{
          fontSize: "var(--type-hero)",
          color: "var(--ink-eyebrow)",
          marginBlockStart: "0.875rem",
          lineHeight: 1,
        }}
      >
        ₪—
      </div>
    </section>
  );
}

function HeroEmpty() {
  const router = useRouter();
  return (
    <section className="flex flex-col items-center gap-4 text-center" style={{ paddingBlockStart: "1.5rem" }}>
      <Eyebrow>Pulse</Eyebrow>
      <h1
        style={{
          fontSize: "var(--type-eom)",
          color: "var(--ink-primary)",
          fontWeight: 300,
          letterSpacing: "var(--tracking-hero)",
          lineHeight: 1.1,
        }}
      >
        הוסף יתרת בנק כדי להתחיל
      </h1>
      {/* Phase 429 review-fix: variant="soft" so the GoldPill below
         is the only loud Gold element in viewport-1 of the empty
         state. */}
      <ConciergeSentence variant="soft">
        ברגע שתזין יתרה אחת, Pulse יוצא לדרך — תחזיות, הלוואות, ופעילות יתעדכנו אוטומטית.
      </ConciergeSentence>
      <GoldPill
        onClick={() => router.push("/?tab=settings")}
        ariaLabel="הוסף יתרת בנק"
      >
        הוסף יתרת בנק
      </GoldPill>
    </section>
  );
}

// ── ChangeAndNextSection ────────────────────────────────────────────
//
// Two ledger rows answering "what changed since yesterday" and
// "what's next". Always visible when data exists. No drawer; these
// are the 3-second answers.

export function ChangeAndNextSection({ data }: { data: HomeData }) {
  if (!data.ready) return null;
  return (
    <SectionAir size="hero">
      <Eyebrow>תזרים · 24 שעות</Eyebrow>
      <HomeHeading level={2}>שינויים אחרונים</HomeHeading>
      <ul className="mt-3 flex flex-col gap-1">
        <li>
          <LedgerRow
            label={
              data.delta24h > 0
                ? `מאתמול · ${data.delta24hCount} ${data.delta24hCount === 1 ? "פעולה" : "פעולות"}`
                : "מאתמול · שקט"
            }
            meta={data.lastOutLabel ?? undefined}
            amount={
              data.delta24h > 0 ? money(-data.delta24h, { sign: true }) : <EmptyDash />
            }
            amountTone={data.delta24h > 0 ? "danger" : "body"}
          />
        </li>
        <li>
          {data.nextEvent ? (
            <LedgerRow
              label={`הבא בתור · ${data.nextEvent.label}`}
              meta={relativeDay(new Date(data.nextEvent.whenISO))}
              amount={money(-data.nextEvent.amount, { sign: true })}
              amountTone="body"
              accent={<NeonAccent />}
            />
          ) : (
            <LedgerRow label="הבא בתור" amount={<EmptyDash />} amountTone="body" />
          )}
        </li>
      </ul>
    </SectionAir>
  );
}

// ── PendingAndActionsSection ────────────────────────────────────────
//
// Gold pill (visible only when pending count > 0) +
// three GhostCta buttons: הוצאה, משיכת מזומן, סימון הכנסה
// Single Gold sentence rule honored: when pill is visible, Hero's
// EOM Gold sentence already faded to soft variant via priority.

export function PendingAndActionsSection({
  data,
  onExpense,
  onWithdrawal,
}: {
  data: HomeData;
  onExpense: () => void;
  onWithdrawal: () => void;
}) {
  return (
    <SectionAir size="xl">
      {data.pendingCount > 0 ? (
        <div className="flex justify-center" style={{ marginBlockEnd: "1.5rem" }}>
          <GoldPill
            onClick={() => openAttentionCenter()}
            ariaLabel={`${data.pendingCount} פעולות מחכות לאישור`}
          >
            {data.pendingCount} {data.pendingCount === 1 ? "חיוב מחכה" : "חיובים מחכים"} לאישור
          </GoldPill>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <GhostCta onClick={onExpense} ariaLabel="הוסף הוצאה">
          הוצאה
        </GhostCta>
        <GhostCta onClick={onWithdrawal} ariaLabel="הוסף משיכת מזומן">
          משיכה
        </GhostCta>
        <GhostCta onClick={() => navigateToTab("dashboard", "income")} ariaLabel="סמן הכנסה כהתקבל">
          הכנסה
        </GhostCta>
      </div>
    </SectionAir>
  );
}

// ── ObligationsSection ──────────────────────────────────────────────
//
// Single line: total + per-lane breakdown via expand. No card chrome.

export function ObligationsSection({ data }: { data: HomeData }) {
  const [open, setOpen] = useState(false);
  if (!data.ready) return null;
  const total = data.loansThisMonth + data.fixedThisMonth + data.cardsThisMonth;
  if (total === 0) return null;
  return (
    <SectionAir size="xl">
      <Eyebrow>חיובים · החודש</Eyebrow>
      <HomeHeading level={2}>חיובי החודש</HomeHeading>
      <LedgerRow
        label="סה״כ יורד מהבנק החודש"
        amount={money(-total, { sign: true })}
        amountTone="primary"
        accent={<NeonAccent />}
        onClick={() => setOpen((v) => !v)}
        ariaLabel="פירוט חיובים החודש"
      />
      <SpringDrawer open={open}>
        <ul className="flex flex-col gap-1">
          <DrawerLine
            label="הלוואות"
            amount={data.loansThisMonth}
            tone="var(--lane-loan)"
          />
          <DrawerLine
            label="הוצאות קבועות"
            amount={data.fixedThisMonth}
            tone="var(--lane-bank)"
          />
          <DrawerLine
            label="חיובי אשראי"
            amount={data.cardsThisMonth}
            tone="var(--lane-card)"
          />
        </ul>
      </SpringDrawer>
    </SectionAir>
  );
}

function DrawerLine({
  label,
  amount,
  tone,
}: {
  label: string;
  amount: number;
  tone: string;
}) {
  if (amount === 0) return null;
  return (
    <li>
      <LedgerRow
        label={label}
        amount={money(-amount, { sign: true })}
        amountTone="body"
        accent={
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: tone,
            }}
          />
        }
      />
    </li>
  );
}

// ── IncomeSection ───────────────────────────────────────────────────

export function IncomeSection({ data }: { data: HomeData }) {
  if (!data.ready || data.incomeThisMonth === 0) return null;
  return (
    <SectionAir size="xl">
      <Eyebrow>הכנסות · החודש</Eyebrow>
      <HomeHeading level={2}>הכנסות החודש</HomeHeading>
      <LedgerRow
        label="התקבל מתחילת החודש"
        amount={money(data.incomeThisMonth, { sign: true })}
        amountTone="primary"
        accent={<NeonAccent />}
      />
    </SectionAir>
  );
}

// ── ConciergeNoteSection ────────────────────────────────────────────

export function ConciergeNoteSection({ data }: { data: HomeData }) {
  if (!data.ready) return null;
  // Phase 429 review-fix: when the pending GoldPill is visible it
  // already carries the loud Gold signal for the viewport. Demote
  // this section to soft so two loud Gold elements never coexist.
  const sentence = buildConciergeNote(data);
  if (!sentence) return null;
  const variant: "loud" | "soft" = data.pendingCount > 0 ? "soft" : "loud";
  return (
    <SectionAir size="lg">
      <Eyebrow>טייס פיננסי</Eyebrow>
      <HomeHeading level={2}>הערת הטייס</HomeHeading>
      <div className="mt-2">
        <ConciergeSentence variant={variant}>{sentence}</ConciergeSentence>
      </div>
    </SectionAir>
  );
}

function buildConciergeNote(d: HomeData): string | null {
  if (d.safetyState === "stress") {
    return `הקצב הזה חוצה את התקציב. סוף החודש צפוי בגירעון ${money(Math.abs(d.eomForecast))}.`;
  }
  if (d.safetyState === "watch") {
    return `המרווח לסוף החודש קצר. נשאר ${money(d.eomForecast)} בלבד.`;
  }
  if (d.delta24h > 0 && d.delta24hCount > 0) {
    return `מאתמול הוצאת ${money(d.delta24h)} ב־${d.delta24hCount} פעולות — נשאר עוד מרווח.`;
  }
  if (d.nextEvent) {
    return `הבא בתור: ${d.nextEvent.label} ${relativeDay(new Date(d.nextEvent.whenISO))} בסך ${money(d.nextEvent.amount)}.`;
  }
  return null;
}

// ── UpcomingSection ─────────────────────────────────────────────────

export function UpcomingSection({ data }: { data: HomeData }) {
  if (!data.ready || data.upcomingFortnight.length === 0) return null;
  return (
    <SectionAir size="lg">
      <Eyebrow>14 ימים קדימה</Eyebrow>
      <HomeHeading level={2}>אירועים בשבועיים הקרובים</HomeHeading>
      <ul className="mt-2 flex flex-col">
        {data.upcomingFortnight.map((e, i) => {
          const tone =
            e.kind === "loan"
              ? "var(--lane-loan)"
              : e.kind === "card"
                ? "var(--lane-card)"
                : e.kind === "income"
                  ? "var(--lane-income)"
                  : "var(--lane-bank)";
          const sign = e.kind === "income" ? +1 : -1;
          return (
            <li key={`${e.whenISO}-${i}`}>
              <LedgerRow
                label={e.label}
                meta={shortDate(new Date(e.whenISO))}
                amount={money(sign * e.amount, { sign: true })}
                amountTone={e.kind === "income" ? "body" : "primary"}
                accent={
                  <span
                    aria-hidden
                    style={{
                      display: "inline-block",
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: tone,
                    }}
                  />
                }
              />
            </li>
          );
        })}
      </ul>
    </SectionAir>
  );
}

// ── RecentActivitySection ───────────────────────────────────────────

export function RecentActivitySection({ data }: { data: HomeData }) {
  if (!data.ready || data.recentActivity.length === 0) return null;
  return (
    <SectionAir size="md">
      <Eyebrow>פעילות אחרונה</Eyebrow>
      <HomeHeading level={2}>פעילות אחרונה</HomeHeading>
      <ul className="mt-2 flex flex-col">
        {data.recentActivity.map((r) => (
          <li key={r.id}>
            <LedgerRow
              label={r.label}
              meta={relativeDay(new Date(r.whenISO))}
              amount={
                r.direction === "in"
                  ? money(r.amount, { sign: true })
                  : money(-r.amount, { sign: true })
              }
              amountTone={
                r.direction === "in" ? "body" : r.isWithdrawal ? "body" : "primary"
              }
            />
          </li>
        ))}
      </ul>
    </SectionAir>
  );
}

// ── Compound: HomeContent ───────────────────────────────────────────
//
// Single mount used by dashboard-tab. Hosts the dialogs the GhostCtas
// open. No floating CTA. No icons. No cards.

export function HomeContent() {
  const data = useHomeData();
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  return (
    <>
      <HeroSection data={data} />
      <ChangeAndNextSection data={data} />
      <PendingAndActionsSection
        data={data}
        onExpense={() => setExpenseOpen(true)}
        onWithdrawal={() => setWithdrawalOpen(true)}
      />
      <ObligationsSection data={data} />
      <IncomeSection data={data} />
      <ConciergeNoteSection data={data} />
      <UpcomingSection data={data} />
      <RecentActivitySection data={data} />
      <ExpenseDialog open={expenseOpen} onOpenChange={setExpenseOpen} />
      <WithdrawalDialog open={withdrawalOpen} onOpenChange={setWithdrawalOpen} />
    </>
  );
}

