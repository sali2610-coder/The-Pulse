"use client";

// Phase 432 · AURORA v1 — Preview gallery
//
// Visual QA surface for Phase 2 (layout shell) + Phase 3 (primitives).
// Reachable at /aurora-preview without authentication. No store/
// engine reads — all data on this page is literal fixture text.
//
// Sections, top to bottom:
//   1. Shell intro (already a Phase 2 deliverable)
//   2. Typography ladder
//   3. Eyebrow + heading pairing
//   4. GlassCard variants
//   5. BentoGrid example layout
//   6. DigitOdometer v2 with live click-to-change
//   7. LedgerRow (out / in / pending + tappable)
//   8. BreathingCaret
//   9. ConciergeSentence (loud + soft)
//  10. WhisperCard

import { useRef, useState } from "react";

import { AuroraShell } from "@/components/aurora/aurora-shell";
import { Screen } from "@/components/aurora/aurora-screen";
import { TopBar } from "@/components/aurora/aurora-top-bar";
import {
  BottomNav,
  type BottomNavTab,
  type TabKey,
} from "@/components/aurora/aurora-bottom-nav";
import { Eyebrow } from "@/components/aurora/aurora-eyebrow";
import { GlassCard } from "@/components/aurora/aurora-glass-card";
import {
  BentoGrid,
  BentoItem,
} from "@/components/aurora/aurora-bento-grid";
import { DigitOdometer } from "@/components/aurora/aurora-digit-odometer";
import {
  LaneDot,
  LedgerRow,
} from "@/components/aurora/aurora-ledger-row";
import { BreathingCaret } from "@/components/aurora/aurora-breathing-caret";
import { ConciergeSentence } from "@/components/aurora/aurora-concierge-sentence";
import { WhisperCard } from "@/components/aurora/aurora-whisper-card";

const TABS: BottomNavTab[] = [
  { key: "home", label: "בית", icon: <HomeGlyph /> },
  { key: "activity", label: "עסקאות", icon: <ActivityGlyph /> },
  { key: "timeline", label: "ציר זמן", icon: <TimelineGlyph /> },
  { key: "settings", label: "הגדרות", icon: <SettingsGlyph /> },
];

const ODOMETER_VALUES = ["₪14,580", "₪14,680", "₪13,920", "₪19,130"];

export default function AuroraPreviewPage() {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  const [tab, setTab] = useState<TabKey>("home");
  const [odoIdx, setOdoIdx] = useState(0);

  return (
    <AuroraShell>
      <Screen
        scrollSentinelRef={(el) => {
          sentinelRef.current = el;
          setSentinel(el);
        }}
        topBar={
          <TopBar
            title="Pulse"
            trailing={<NotificationsTrigger />}
            sentinelEl={sentinel}
          />
        }
        bottomNav={
          <BottomNav
            tabs={TABS}
            active={tab}
            onChange={setTab}
            addSlot={<AddPill />}
          />
        }
      >
        <Gallery
          odo={ODOMETER_VALUES[odoIdx % ODOMETER_VALUES.length]}
          onOdoTick={() => setOdoIdx((i) => i + 1)}
        />
      </Screen>
    </AuroraShell>
  );
}

function Gallery({ odo, onOdoTick }: { odo: string; onOdoTick: () => void }) {
  return (
    <article
      style={{
        paddingBlockStart:
          "calc(var(--aurora-top-bar-h) + var(--aurora-space-7))",
        paddingBlockEnd: "var(--aurora-space-9)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--aurora-space-8)",
      }}
    >
      <h1 className="sr-only">תצוגה מקדימה של רכיבי AURORA</h1>

      {/* 1. Intro */}
      <Section eyebrow="AURORA · PHASE 3 PREVIEW" srHeading="הקדמה">
        <h2 className="aurora-title-l">רכיבי הליבה של Pulse</h2>
        <p className="aurora-body-l aurora-ink-2">
          Phase 1 (טוקנים) + Phase 2 (קליפת השכבה) + Phase 3 (רכיבי
          ליבה) מוכנים. הדף הזה מציג את הרכיבים בעיצוב הסופי שלהם
          בלי לחבר אותם לעסקה אמיתית.
        </p>
      </Section>

      {/* 2. Typography */}
      <Section eyebrow="TYPOGRAPHY" srHeading="טיפוגרפיה">
        <div
          style={{
            display: "grid",
            gap: "var(--aurora-space-4)",
            color: "var(--aurora-ink-1)",
          }}
        >
          <span style={{ fontSize: "var(--aurora-type-display)", fontWeight: 200, letterSpacing: "var(--aurora-tracking-display)", lineHeight: 1 }}>
            72pt · Display
          </span>
          <span style={{ fontSize: "var(--aurora-type-hero)", fontWeight: 300, letterSpacing: "var(--aurora-tracking-hero)", lineHeight: 1.05 }}>
            56pt · Hero
          </span>
          <span style={{ fontSize: "var(--aurora-type-eom)", fontWeight: 300, letterSpacing: "var(--aurora-tracking-hero)", lineHeight: 1.1 }}>
            40pt · EOM
          </span>
          <span style={{ fontSize: "var(--aurora-type-title-l)", letterSpacing: "var(--aurora-tracking-title-l)" }}>
            28pt · Title L
          </span>
          <span style={{ fontSize: "var(--aurora-type-title-m)", letterSpacing: "var(--aurora-tracking-title-m)" }}>
            22pt · Title M
          </span>
          <span style={{ fontSize: "var(--aurora-type-body-l)" }}>17pt · Body L · משפט קונסיירז׳</span>
          <span style={{ fontSize: "var(--aurora-type-body)", color: "var(--aurora-ink-2)" }}>
            14pt · Body · טקסט גוף סטנדרטי
          </span>
          <span style={{ fontSize: "var(--aurora-type-eyebrow)", fontWeight: 600, letterSpacing: "var(--aurora-tracking-eyebrow)", color: "var(--aurora-ink-4)" }}>
            11PT · EYEBROW
          </span>
        </div>
      </Section>

      {/* 3. Eyebrow */}
      <Section eyebrow="EYEBROW" srHeading="גבה למילה">
        <p className="aurora-body aurora-ink-3">
          Eyebrow + sr-only h2. הגבה רואה את ה-11pt, screen reader קורא
          את כותרת ה-h2 הסמויה.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--aurora-space-2)" }}>
          <Eyebrow srHeading={{ level: 3, text: "תזרים החודש" }}>
            ◆ תזרים · יוני 2026
          </Eyebrow>
          <Eyebrow srHeading={{ level: 3, text: "השווי הצפוי" }}>
            EOM FORECAST
          </Eyebrow>
        </div>
      </Section>

      {/* 4. GlassCard variants */}
      <Section eyebrow="GLASSCARD" srHeading="כרטיסי זכוכית">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--aurora-space-4)",
          }}
        >
          <GlassCard elevation="base" radius="bento">
            <span className="aurora-eyebrow">BASE · bento</span>
            <div className="aurora-title-m" style={{ marginBlockStart: "var(--aurora-space-1)" }}>
              שקיפות בסיס
            </div>
          </GlassCard>
          <GlassCard elevation="elev-1" radius="bento">
            <span className="aurora-eyebrow">ELEV-1 · bento</span>
            <div className="aurora-title-m" style={{ marginBlockStart: "var(--aurora-space-1)" }}>
              ברירת מחדל
            </div>
          </GlassCard>
          <GlassCard elevation="elev-2" radius="hero" padding="spacious">
            <span className="aurora-eyebrow">ELEV-2 · hero</span>
            <div className="aurora-title-m" style={{ marginBlockStart: "var(--aurora-space-1)" }}>
              שכבת גליון
            </div>
          </GlassCard>
          <GlassCard elevation="elev-1" radius="modal" tone="danger">
            <span className="aurora-eyebrow">TONE · danger</span>
            <div className="aurora-title-m" style={{ marginBlockStart: "var(--aurora-space-1)" }}>
              גבול אדום
            </div>
          </GlassCard>
        </div>
      </Section>

      {/* 5. BentoGrid */}
      <Section eyebrow="BENTOGRID" srHeading="מערך בנטו">
        <BentoGrid gap="comfortable">
          <BentoItem span={6} rowSpan={1}>
            <GlassCard elevation="elev-1" radius="hero" padding="spacious">
              <span className="aurora-eyebrow">FULL ROW · 6/6</span>
              <div className="aurora-title-l" style={{ marginBlockStart: "var(--aurora-space-1)" }}>
                סלוט גיבור
              </div>
            </GlassCard>
          </BentoItem>
          <BentoItem span={3}>
            <GlassCard elevation="elev-1" padding="comfortable">
              <span className="aurora-eyebrow">3/6</span>
              <div className="aurora-title-m" style={{ marginBlockStart: "var(--aurora-space-1)" }}>
                חצי
              </div>
            </GlassCard>
          </BentoItem>
          <BentoItem span={3}>
            <GlassCard elevation="elev-1" padding="comfortable">
              <span className="aurora-eyebrow">3/6</span>
              <div className="aurora-title-m" style={{ marginBlockStart: "var(--aurora-space-1)" }}>
                חצי
              </div>
            </GlassCard>
          </BentoItem>
          <BentoItem span={2}>
            <GlassCard elevation="base" padding="compact">
              <span className="aurora-eyebrow">2/6</span>
            </GlassCard>
          </BentoItem>
          <BentoItem span={2}>
            <GlassCard elevation="base" padding="compact">
              <span className="aurora-eyebrow">2/6</span>
            </GlassCard>
          </BentoItem>
          <BentoItem span={2}>
            <GlassCard elevation="base" padding="compact">
              <span className="aurora-eyebrow">2/6</span>
            </GlassCard>
          </BentoItem>
        </BentoGrid>
      </Section>

      {/* 6. DigitOdometer */}
      <Section eyebrow="DIGITODOMETER · v2" srHeading="מד ספרות">
        <p className="aurora-body aurora-ink-3">
          לחץ על המספר כדי לעדכן את הערך. הקו תחתיו (BreathingCaret)
          ממשיך לנשום מבלי להפסיק.
        </p>
        <button
          type="button"
          onClick={onOdoTick}
          aria-label="עדכן ערך"
          className="aurora-odo-tap"
          style={{
            background: "transparent",
            border: 0,
            cursor: "pointer",
            padding: 0,
            display: "inline-flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--aurora-space-1)",
            color: "var(--aurora-ink-1)",
          }}
        >
          <DigitOdometer
            value={odo}
            ariaLabel={`יתרה ${odo}`}
            style={{
              fontSize: "var(--aurora-type-hero)",
              fontWeight: 300,
              letterSpacing: "var(--aurora-tracking-hero)",
              lineHeight: 1,
            }}
          />
          <BreathingCaret width={96} />
        </button>
      </Section>

      {/* 7. LedgerRow */}
      <Section eyebrow="LEDGERROW" srHeading="שורת ספר">
        <GlassCard elevation="elev-1" padding="compact">
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: "var(--aurora-space-1)",
            }}
          >
            <li>
              <LedgerRow
                accent={<LaneDot color="var(--aurora-lane-loan)" />}
                label="הלוואת לימודים"
                meta="היום · 14:23"
                amount="−₪2,700"
                direction="out"
              />
            </li>
            <li aria-hidden style={{ height: 1, background: "var(--aurora-hairline-faint)" }} />
            <li>
              <LedgerRow
                accent={<LaneDot color="var(--aurora-lane-income)" />}
                label="משכורת"
                meta="03.07 · אוט׳"
                amount="+₪18,000"
                direction="in"
              />
            </li>
            <li aria-hidden style={{ height: 1, background: "var(--aurora-hairline-faint)" }} />
            <li>
              <LedgerRow
                accent={<LaneDot color="var(--aurora-lane-card)" />}
                label="חיוב חדש מ-ויזה"
                meta="ממתין"
                amount="−₪145"
                direction="pending"
                onClick={() => {}}
                ariaLabel="פתח פרטי חיוב ויזה ₪145"
              />
            </li>
          </ul>
        </GlassCard>
      </Section>

      {/* 8. BreathingCaret */}
      <Section eyebrow="BREATHINGCARET" srHeading="קו נשימה">
        <p className="aurora-body aurora-ink-3">
          קו ניאון 2pt עם נשימה של 6 שניות. CSS בלבד. עוצר אוטומטית
          תחת prefers-reduced-motion.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--aurora-space-2)" }}>
          <BreathingCaret width={64} />
          <BreathingCaret width={128} />
          <BreathingCaret width={192} />
        </div>
      </Section>

      {/* 9. ConciergeSentence */}
      <Section eyebrow="CONCIERGESENTENCE" srHeading="משפט הקונסיירז׳">
        <ConciergeSentence variant="loud">
          ביוני תסיים עם ₪14,580 — 13% מעל הממוצע השנתי. כל הכבוד.
        </ConciergeSentence>
        <ConciergeSentence variant="soft">
          סוף החודש בטוח · יעד ₪25,000.
        </ConciergeSentence>
      </Section>

      {/* 10. WhisperCard */}
      <Section eyebrow="WHISPERCARD" srHeading="קלף לחישה">
        <WhisperCard
          variant="loud"
          sentence="קצב 'מסעדות' שלך חזק. השבוע ₪0 — שיא ב-6 חודשים."
          actions={
            <>
              <button type="button" className="aurora-ghost-button">הראה גרף</button>
              <button type="button" className="aurora-ghost-button">התעלם</button>
            </>
          }
        />
        <WhisperCard
          variant="soft"
          sentence="3 חיובים גדולים השבוע · נשאר ₪3,200."
        />
      </Section>
    </article>
  );
}

function Section({
  eyebrow,
  srHeading,
  children,
}: {
  eyebrow: string;
  srHeading: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--aurora-space-4)",
      }}
    >
      <Eyebrow srHeading={{ level: 2, text: srHeading }}>{eyebrow}</Eyebrow>
      {children}
    </section>
  );
}

function NotificationsTrigger() {
  return (
    <button type="button" aria-label="התראות" className="aurora-icon-button">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
        <path
          d="M5 8a5 5 0 0110 0v3l1.5 2H3.5L5 11V8z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M8 16a2 2 0 004 0"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

function AddPill() {
  return (
    <button
      type="button"
      aria-label="הוסף"
      style={{
        appearance: "none",
        border: 0,
        cursor: "pointer",
        width: 56,
        height: 56,
        borderRadius: 9999,
        background:
          "conic-gradient(from 220deg at 50% 50%, var(--aurora-brand-aurora-1), var(--aurora-brand-aurora-2), var(--aurora-brand-aurora-3), var(--aurora-brand-aurora-1))",
        color: "var(--aurora-brand-charcoal)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "var(--aurora-shadow-lift)",
      }}
    >
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
        <path
          d="M11 4v14M4 11h14"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

function HomeGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <path
        d="M4 10l7-6 7 6v8a1 1 0 01-1 1h-4v-5H9v5H5a1 1 0 01-1-1v-8z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function ActivityGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <path
        d="M3 6h16M3 11h16M3 16h10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
function TimelineGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 5v6l4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function SettingsGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <path d="M3 6h12M3 11h16M3 16h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="17" cy="6" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="6" cy="11" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="16" r="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
