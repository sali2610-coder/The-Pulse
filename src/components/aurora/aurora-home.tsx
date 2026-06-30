"use client";

// Phase 432 part 3 · AURORA v1 — Aurora Home (production composition)
//
// Real Pulse dashboard assembled from the Phase 3 primitives + the
// useAuroraHome read hook. No demo. No placeholders. Every card
// reads live engine data. Every card is tappable → BottomSheet
// with details.
//
// Composition order (top → bottom):
//   1. Cinema hero — live + EOM + concierge + breathing caret
//   2. Today + Next event (2-up bento)
//   3. Coach whisper (when engine has something to say)
//   4. Budget progress (bento wide)
//   5. Weekly spend bars (bento wide)
//   6. Obligations split — loans + fixed + cards (3-up bento)
//   7. Income (bento wide)
//   8. Upcoming 14 days
//   9. Recent activity
// Each section becomes a sheet target on tap.

import { useState, type ReactNode } from "react";

import {
  BentoGrid,
  BentoItem,
} from "@/components/aurora/aurora-bento-grid";
import { BreathingCaret } from "@/components/aurora/aurora-breathing-caret";
import {
  ConciergeSentence,
} from "@/components/aurora/aurora-concierge-sentence";
import { DigitOdometer } from "@/components/aurora/aurora-digit-odometer";
import { Eyebrow } from "@/components/aurora/aurora-eyebrow";
import { GlassCard } from "@/components/aurora/aurora-glass-card";
import {
  LaneDot,
  LedgerRow,
} from "@/components/aurora/aurora-ledger-row";
import { WhisperCard } from "@/components/aurora/aurora-whisper-card";
import { BottomSheet } from "@/components/ui/bottom-sheet";

import {
  useAuroraHome,
  type AuroraHomeData,
  type AuroraUpcomingEvent,
} from "./use-aurora-home";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});
const DAY_FMT = new Intl.DateTimeFormat("he-IL", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

type SheetKey =
  | "hero"
  | "today"
  | "next"
  | "budget"
  | "weekly"
  | "loans"
  | "fixed"
  | "cards"
  | "income"
  | "upcoming"
  | "activity"
  | null;

export function AuroraHome() {
  const data = useAuroraHome();
  const [sheet, setSheet] = useState<SheetKey>(null);
  const open = sheet !== null;

  return (
    <div
      style={{
        paddingBlockStart:
          "calc(var(--aurora-top-bar-h) + var(--aurora-space-7))",
        paddingBlockEnd: "var(--aurora-space-8)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--aurora-space-7)",
      }}
    >
      <h1 className="sr-only">מסך הבית של Pulse</h1>

      <Hero data={data} onOpen={() => setSheet("hero")} />

      <BentoGrid gap="comfortable">
        <BentoItem span={3}>
          <TodayCard data={data} onOpen={() => setSheet("today")} />
        </BentoItem>
        <BentoItem span={3}>
          <NextEventCard data={data} onOpen={() => setSheet("next")} />
        </BentoItem>

        {data.coachSentence ? (
          <BentoItem span={6}>
            <WhisperCard
              variant={data.coachVariant}
              sentence={data.coachSentence}
            />
          </BentoItem>
        ) : null}

        <BentoItem span={6}>
          <BudgetCard data={data} onOpen={() => setSheet("budget")} />
        </BentoItem>

        <BentoItem span={6}>
          <WeeklyCard data={data} onOpen={() => setSheet("weekly")} />
        </BentoItem>

        <BentoItem span={2}>
          <LaneCard
            label="הלוואות"
            color="var(--aurora-lane-loan)"
            amount={data.loansThisMonth}
            onOpen={() => setSheet("loans")}
          />
        </BentoItem>
        <BentoItem span={2}>
          <LaneCard
            label="קבועים"
            color="var(--aurora-lane-bank)"
            amount={data.fixedThisMonth}
            onOpen={() => setSheet("fixed")}
          />
        </BentoItem>
        <BentoItem span={2}>
          <LaneCard
            label="אשראי"
            color="var(--aurora-lane-card)"
            amount={data.cardsThisMonth}
            onOpen={() => setSheet("cards")}
          />
        </BentoItem>

        <BentoItem span={6}>
          <IncomeCard data={data} onOpen={() => setSheet("income")} />
        </BentoItem>

        <BentoItem span={6}>
          <UpcomingCard data={data} onOpen={() => setSheet("upcoming")} />
        </BentoItem>

        <BentoItem span={6}>
          <ActivityCard data={data} onOpen={() => setSheet("activity")} />
        </BentoItem>
      </BentoGrid>

      <BottomSheet
        open={open}
        onOpenChange={(o) => (o ? null : setSheet(null))}
        title={sheetTitle(sheet)}
      >
        {sheet ? <SheetBody kind={sheet} data={data} /> : null}
      </BottomSheet>
    </div>
  );
}

// ───────────────────────────────── HERO ─────────────────────────

function Hero({ data, onOpen }: { data: AuroraHomeData; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="פתח פרטי יתרה"
      className="aurora-hero-card"
    >
      <span aria-hidden className="aurora-hero-scrim" />
      <div className="aurora-hero-content">
        <Eyebrow srHeading={{ level: 2, text: "תמונת מצב חיה" }}>
          {data.safetyLabel.toUpperCase()} · {data.monthLabel}
        </Eyebrow>
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          יתרה חיה {ILS.format(data.livBalance)}. צפי לסוף החודש{" "}
          {ILS.format(data.eomForecast)} — {data.safetyLabel}.
        </span>
        <div
          dir="ltr"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--aurora-type-display)",
            fontWeight: 200,
            letterSpacing: "var(--aurora-tracking-display)",
            lineHeight: 1,
            color: "var(--aurora-ink-1)",
            marginBlockStart: "var(--aurora-space-4)",
          }}
        >
          <DigitOdometer value={ILS.format(data.livBalance)} />
        </div>
        <BreathingCaret width={112} />

        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBlockStart: "var(--aurora-space-6)",
            gap: "var(--aurora-space-4)",
          }}
        >
          <span
            style={{
              fontSize: "var(--aurora-type-eyebrow)",
              letterSpacing: "var(--aurora-tracking-eyebrow)",
              fontWeight: 600,
              color: "var(--aurora-ink-3)",
            }}
          >
            סוף החודש · {data.daysToEom} ימים נותרו
          </span>
          <span
            dir="ltr"
            style={{
              fontSize: "var(--aurora-type-eom)",
              fontWeight: 300,
              letterSpacing: "var(--aurora-tracking-hero)",
              color:
                data.safetyState === "stress"
                  ? "var(--aurora-state-danger)"
                  : data.safetyState === "watch"
                    ? "var(--aurora-state-watch)"
                    : "var(--aurora-ink-1)",
            }}
          >
            <DigitOdometer value={ILS.format(data.eomForecast)} />
          </span>
        </div>

        {data.coachSentence ? (
          <div style={{ marginBlockStart: "var(--aurora-space-4)" }}>
            <ConciergeSentence variant="soft">
              {data.coachSentence}
            </ConciergeSentence>
          </div>
        ) : null}
      </div>
    </button>
  );
}

// ───────────────────────────────── BENTO CARDS ──────────────────

function TodayCard({
  data,
  onOpen,
}: {
  data: AuroraHomeData;
  onOpen: () => void;
}) {
  return (
    <CardButton onClick={onOpen} ariaLabel="פתח פירוט יומי">
      <GlassCard elevation="elev-1" padding="comfortable" radius="bento">
        <Eyebrow srHeading={{ level: 3, text: "סטטוס היום" }}>
          היום
        </Eyebrow>
        <div
          dir="ltr"
          style={{
            fontSize: "var(--aurora-type-title-l)",
            fontWeight: 400,
            color: "var(--aurora-ink-1)",
            marginBlockStart: "var(--aurora-space-2)",
          }}
        >
          {ILS.format(data.dailyAllowanceAmount)}
        </div>
        <p
          className="aurora-body aurora-ink-3"
          style={{ marginBlockStart: "var(--aurora-space-1)" }}
        >
          מותר עוד היום
        </p>
        <p
          className="aurora-body aurora-ink-3"
          style={{ marginBlockStart: "var(--aurora-space-2)" }}
        >
          הוצאת {ILS.format(data.spentToday)} מתחילת היום
        </p>
      </GlassCard>
    </CardButton>
  );
}

function NextEventCard({
  data,
  onOpen,
}: {
  data: AuroraHomeData;
  onOpen: () => void;
}) {
  return (
    <CardButton onClick={onOpen} ariaLabel="פתח אירועים קרובים">
      <GlassCard elevation="elev-1" padding="comfortable" radius="bento">
        <Eyebrow srHeading={{ level: 3, text: "האירוע הבא" }}>
          הבא בתור
        </Eyebrow>
        {data.nextEvent ? (
          <>
            <div
              dir="ltr"
              style={{
                fontSize: "var(--aurora-type-title-l)",
                fontWeight: 400,
                color: laneColor(data.nextEvent.kind),
                marginBlockStart: "var(--aurora-space-2)",
              }}
            >
              {data.nextEvent.kind === "income" ? "+" : "−"}
              {ILS.format(data.nextEvent.amount)}
            </div>
            <p
              className="aurora-body aurora-ink-2"
              style={{ marginBlockStart: "var(--aurora-space-1)" }}
            >
              {data.nextEvent.label}
            </p>
            <p
              className="aurora-body aurora-ink-3"
              style={{ marginBlockStart: "var(--aurora-space-2)" }}
            >
              {data.nextEvent.daysUntil === 0
                ? "היום"
                : data.nextEvent.daysUntil === 1
                  ? "מחר"
                  : `בעוד ${data.nextEvent.daysUntil} ימים`}
            </p>
          </>
        ) : (
          <p className="aurora-body aurora-ink-3" style={{ marginBlockStart: "var(--aurora-space-2)" }}>
            אין אירועים קרובים.
          </p>
        )}
      </GlassCard>
    </CardButton>
  );
}

function BudgetCard({
  data,
  onOpen,
}: {
  data: AuroraHomeData;
  onOpen: () => void;
}) {
  const pct = data.budgetTotal > 0 ? data.budgetPct : 0;
  const tone =
    pct >= 100
      ? "var(--aurora-state-danger)"
      : pct >= 80
        ? "var(--aurora-state-watch)"
        : "var(--aurora-state-safe)";
  return (
    <CardButton onClick={onOpen} ariaLabel="פתח בקרת תקציב">
      <GlassCard elevation="elev-1" padding="spacious" radius="hero">
        <Eyebrow srHeading={{ level: 3, text: "בקרת תקציב" }}>
          בקרת תקציב · החודש
        </Eyebrow>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBlockStart: "var(--aurora-space-3)",
            gap: "var(--aurora-space-3)",
          }}
        >
          <span
            dir="ltr"
            style={{
              fontSize: "var(--aurora-type-title-l)",
              fontWeight: 400,
              color: "var(--aurora-ink-1)",
            }}
          >
            <DigitOdometer value={ILS.format(data.budgetSpent)} />
          </span>
          <span className="aurora-body aurora-ink-3">
            מתוך {ILS.format(data.budgetTotal)}
          </span>
        </div>
        <div className="aurora-budget-bar" aria-hidden style={{ marginBlockStart: "var(--aurora-space-3)" }}>
          <div
            className="aurora-budget-bar-fill"
            style={{
              width: `${Math.min(100, pct)}%`,
              background: tone,
            }}
          />
        </div>
        <p
          className="aurora-body aurora-ink-3"
          style={{ marginBlockStart: "var(--aurora-space-2)" }}
        >
          נותר {ILS.format(data.budgetRemaining)} · {pct}% נוצל
        </p>
      </GlassCard>
    </CardButton>
  );
}

function WeeklyCard({
  data,
  onOpen,
}: {
  data: AuroraHomeData;
  onOpen: () => void;
}) {
  const max = Math.max(1, ...data.weeklySpend.map((d) => d.amount));
  const labels = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
  return (
    <CardButton onClick={onOpen} ariaLabel="פתח גרף שבועי">
      <GlassCard elevation="elev-1" padding="spacious" radius="hero">
        <Eyebrow srHeading={{ level: 3, text: "ההוצאות השבוע" }}>
          השבוע · 7 ימים
        </Eyebrow>
        <div
          aria-hidden
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            alignItems: "end",
            gap: "var(--aurora-space-2)",
            height: 88,
            marginBlockStart: "var(--aurora-space-4)",
          }}
        >
          {data.weeklySpend.map((d) => {
            const h = Math.max(6, Math.round((d.amount / max) * 80));
            const isToday = d.dayIndex === data.weeklySpend.length - 1;
            return (
              <div
                key={d.dayISO}
                style={{
                  height: h,
                  borderRadius: "var(--aurora-radius-chip)",
                  background: isToday
                    ? "linear-gradient(180deg, var(--aurora-brand-aurora-2), var(--aurora-brand-aurora-1))"
                    : "var(--aurora-hairline-quiet)",
                  transition:
                    "height var(--aurora-dur-base) var(--aurora-ease-out-soft)",
                }}
              />
            );
          })}
        </div>
        <div
          aria-hidden
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: "var(--aurora-space-2)",
            marginBlockStart: "var(--aurora-space-2)",
          }}
        >
          {labels.map((l, i) => (
            <span
              key={l}
              style={{
                textAlign: "center",
                fontSize: "var(--aurora-type-eyebrow)",
                color: "var(--aurora-ink-4)",
                letterSpacing: "var(--aurora-tracking-eyebrow)",
              }}
            >
              {l}
              {i}
            </span>
          ))}
        </div>
      </GlassCard>
    </CardButton>
  );
}

function LaneCard({
  label,
  color,
  amount,
  onOpen,
}: {
  label: string;
  color: string;
  amount: number;
  onOpen: () => void;
}) {
  return (
    <CardButton onClick={onOpen} ariaLabel={`פתח ${label}`}>
      <GlassCard elevation="elev-1" padding="comfortable" radius="bento">
        <div
          aria-hidden
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: 9999,
            background: color,
          }}
        />
        <p
          className="aurora-body aurora-ink-3"
          style={{ marginBlockStart: "var(--aurora-space-2)" }}
        >
          {label}
        </p>
        <div
          dir="ltr"
          style={{
            fontSize: "var(--aurora-type-title-m)",
            fontWeight: 400,
            color: "var(--aurora-ink-1)",
            marginBlockStart: "var(--aurora-space-1)",
          }}
        >
          {ILS.format(amount)}
        </div>
      </GlassCard>
    </CardButton>
  );
}

function IncomeCard({
  data,
  onOpen,
}: {
  data: AuroraHomeData;
  onOpen: () => void;
}) {
  return (
    <CardButton onClick={onOpen} ariaLabel="פתח הכנסות החודש">
      <GlassCard elevation="elev-1" padding="comfortable" radius="bento">
        <Eyebrow srHeading={{ level: 3, text: "הכנסות החודש" }}>
          הכנסות · החודש
        </Eyebrow>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBlockStart: "var(--aurora-space-2)",
          }}
        >
          <span
            dir="ltr"
            style={{
              fontSize: "var(--aurora-type-title-l)",
              fontWeight: 400,
              color: "var(--aurora-state-safe)",
            }}
          >
            <DigitOdometer value={`+${ILS.format(data.incomeThisMonth)}`} />
          </span>
          <span className="aurora-body aurora-ink-3">
            התקבל מתחילת החודש
          </span>
        </div>
      </GlassCard>
    </CardButton>
  );
}

function UpcomingCard({
  data,
  onOpen,
}: {
  data: AuroraHomeData;
  onOpen: () => void;
}) {
  return (
    <CardButton onClick={onOpen} ariaLabel="פתח לוח אירועים 14 ימים">
      <GlassCard elevation="elev-1" padding="comfortable" radius="bento">
        <Eyebrow srHeading={{ level: 3, text: "14 ימים קדימה" }}>
          14 ימים קדימה
        </Eyebrow>
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            marginBlockStart: "var(--aurora-space-3)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {data.upcomingFortnight.length === 0 ? (
            <p className="aurora-body aurora-ink-3">אין אירועים בשבועיים הקרובים.</p>
          ) : (
            data.upcomingFortnight.slice(0, 3).map((e) => (
              <li key={`${e.whenISO}-${e.label}`}>
                <LedgerRow
                  accent={<LaneDot color={laneColor(e.kind)} />}
                  label={e.label}
                  meta={DAY_FMT.format(new Date(e.whenISO))}
                  amount={
                    (e.kind === "income" ? "+" : "−") + ILS.format(e.amount)
                  }
                  direction={e.kind === "income" ? "in" : "out"}
                />
              </li>
            ))
          )}
        </ul>
      </GlassCard>
    </CardButton>
  );
}

function ActivityCard({
  data,
  onOpen,
}: {
  data: AuroraHomeData;
  onOpen: () => void;
}) {
  return (
    <CardButton onClick={onOpen} ariaLabel="פתח פעילות אחרונה">
      <GlassCard elevation="elev-1" padding="comfortable" radius="bento">
        <Eyebrow srHeading={{ level: 3, text: "פעילות אחרונה" }}>
          פעילות אחרונה
        </Eyebrow>
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            marginBlockStart: "var(--aurora-space-3)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {data.recentActivity.length === 0 ? (
            <p className="aurora-body aurora-ink-3">השבוע שקט אצלך.</p>
          ) : (
            data.recentActivity.slice(0, 4).map((r) => (
              <li key={r.id}>
                <LedgerRow
                  label={r.label}
                  meta={DAY_FMT.format(new Date(r.whenISO))}
                  amount={
                    r.direction === "in"
                      ? `+${ILS.format(r.amount)}`
                      : `−${ILS.format(r.amount)}`
                  }
                  direction={
                    r.direction === "in"
                      ? "in"
                      : r.isWithdrawal
                        ? "pending"
                        : "out"
                  }
                />
              </li>
            ))
          )}
        </ul>
      </GlassCard>
    </CardButton>
  );
}

// ─────────────────────── helpers ────────────────────────────────

function CardButton({
  children,
  onClick,
  ariaLabel,
}: {
  children: ReactNode;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="aurora-card-button"
    >
      {children}
    </button>
  );
}

function laneColor(kind: AuroraUpcomingEvent["kind"]): string {
  switch (kind) {
    case "income":
      return "var(--aurora-lane-income)";
    case "loan":
      return "var(--aurora-lane-loan)";
    case "card":
      return "var(--aurora-lane-card)";
    case "bank_debit":
    default:
      return "var(--aurora-lane-bank)";
  }
}

function sheetTitle(kind: SheetKey): string {
  switch (kind) {
    case "hero":
      return "פירוט יתרה";
    case "today":
      return "סטטוס יומי";
    case "next":
      return "אירועים קרובים";
    case "budget":
      return "בקרת תקציב";
    case "weekly":
      return "ההוצאות השבוע";
    case "loans":
      return "הלוואות";
    case "fixed":
      return "הוצאות קבועות";
    case "cards":
      return "אשראי החודש";
    case "income":
      return "הכנסות החודש";
    case "upcoming":
      return "14 ימים קדימה";
    case "activity":
      return "פעילות אחרונה";
    default:
      return "";
  }
}

function SheetBody({
  kind,
  data,
}: {
  kind: NonNullable<SheetKey>;
  data: AuroraHomeData;
}) {
  // Lightweight detail panes. Each renders the same data shown on
  // the card plus a longer breakdown. Phase 5 will replace these
  // with full per-section drill-downs.
  const text =
    kind === "hero"
      ? `יתרה חיה ${ILS.format(data.livBalance)} · צפי לסוף החודש ${ILS.format(data.eomForecast)}. ${data.coachSentence ?? ""}`
      : kind === "today"
        ? `מותר עוד ${ILS.format(data.dailyAllowanceAmount)} · הוצאת ${ILS.format(data.spentToday)} מתחילת היום · נשארו ${data.daysRemaining} ימים בחודש.`
        : kind === "next"
          ? data.nextEvent
            ? `${data.nextEvent.label} בעוד ${data.nextEvent.daysUntil === 0 ? "היום" : `${data.nextEvent.daysUntil} ימים`} · ${ILS.format(data.nextEvent.amount)}.`
            : "אין אירועים קרובים."
          : kind === "budget"
            ? `${ILS.format(data.budgetSpent)} מתוך ${ILS.format(data.budgetTotal)} (${data.budgetPct}%) · נותר ${ILS.format(data.budgetRemaining)}.`
            : kind === "weekly"
              ? `סך הוצאות בשבוע האחרון · ${ILS.format(data.weeklySpend.reduce((s, d) => s + d.amount, 0))}.`
              : kind === "loans"
                ? `סך הלוואות פעילות החודש · ${ILS.format(data.loansThisMonth)}.`
                : kind === "fixed"
                  ? `סך הוצאות קבועות החודש · ${ILS.format(data.fixedThisMonth)}.`
                  : kind === "cards"
                    ? `סך חיובי אשראי החודש · ${ILS.format(data.cardsThisMonth)}.`
                    : kind === "income"
                      ? `סך הכנסות שהתקבלו · ${ILS.format(data.incomeThisMonth)}.`
                      : kind === "upcoming"
                        ? `${data.upcomingFortnight.length} אירועים בשבועיים הקרובים.`
                        : `${data.recentActivity.length} פעולות אחרונות.`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--aurora-space-4)" }}>
      <p className="aurora-body-l aurora-ink-2">{text}</p>
      {kind === "upcoming" || kind === "activity" ? (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {(kind === "upcoming" ? data.upcomingFortnight : data.recentActivity).map(
            (e, i) => {
              const isUpcoming = kind === "upcoming";
              const label = isUpcoming
                ? (e as AuroraUpcomingEvent).label
                : (e as AuroraHomeData["recentActivity"][number]).label;
              const amount = isUpcoming
                ? (e as AuroraUpcomingEvent).amount
                : Math.abs((e as AuroraHomeData["recentActivity"][number]).amount);
              const kindKey = isUpcoming
                ? (e as AuroraUpcomingEvent).kind
                : ((e as AuroraHomeData["recentActivity"][number]).direction === "in"
                    ? "income"
                    : "bank_debit");
              return (
                <li key={`${i}-${(e as { whenISO: string }).whenISO}`}>
                  <LedgerRow
                    accent={<LaneDot color={laneColor(kindKey)} />}
                    label={label}
                    meta={DAY_FMT.format(new Date((e as { whenISO: string }).whenISO))}
                    amount={
                      (kindKey === "income" ? "+" : "−") + ILS.format(amount)
                    }
                    direction={kindKey === "income" ? "in" : "out"}
                  />
                </li>
              );
            },
          )}
        </ul>
      ) : null}
    </div>
  );
}
