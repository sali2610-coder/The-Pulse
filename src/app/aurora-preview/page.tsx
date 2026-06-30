"use client";

// Phase 430 · AURORA v1 — Layout shell preview route.
//
// Hidden /aurora-preview surface for visual QA of Phase 2 work
// (AuroraShell, AuroraCanvas, Screen, TopBar, BottomNav). Not
// linked from app navigation. Renders the shell with placeholder
// content so reviewers can verify:
//
//   - Aurora blob drift + scrim
//   - TopBar transparent → glass reveal on scroll
//   - BottomNav 5-cell grid + cutout for floating Add button
//   - Safe-area handling on notched iPhones
//   - RTL chevron + center title behavior
//
// No business components. No cards. No widgets. Pure layout.
//
// Phase 3 will swap real screens in and likely drop this route.

import { useRef, useState } from "react";

import { AuroraShell } from "@/components/aurora/aurora-shell";
import { Screen } from "@/components/aurora/aurora-screen";
import { TopBar } from "@/components/aurora/aurora-top-bar";
import {
  BottomNav,
  type BottomNavTab,
  type TabKey,
} from "@/components/aurora/aurora-bottom-nav";

const TABS: BottomNavTab[] = [
  { key: "home", label: "בית", icon: <HomeGlyph /> },
  { key: "activity", label: "עסקאות", icon: <ActivityGlyph /> },
  { key: "timeline", label: "ציר זמן", icon: <TimelineGlyph /> },
  { key: "settings", label: "הגדרות", icon: <SettingsGlyph /> },
];

export default function AuroraPreviewPage() {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  const [tab, setTab] = useState<TabKey>("home");

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
        <PreviewPlaceholder />
      </Screen>
    </AuroraShell>
  );
}

function PreviewPlaceholder() {
  // Placeholder lorem so the scroll-blur reveal can be QA'd.
  // Pure typography — no cards / widgets / charts in Phase 2.
  return (
    <article
      style={{
        paddingBlockStart: "calc(var(--aurora-top-bar-h) + var(--aurora-space-7))",
        paddingBlockEnd: "var(--aurora-space-9)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--aurora-space-5)",
      }}
    >
      <h1
        className="sr-only"
      >
        תצוגה מקדימה של AURORA Shell
      </h1>
      <span
        aria-hidden
        style={{
          fontSize: "var(--aurora-type-eyebrow)",
          letterSpacing: "var(--aurora-tracking-eyebrow)",
          color: "var(--aurora-ink-4)",
          fontWeight: 500,
        }}
      >
        AURORA · PHASE 2 PREVIEW
      </span>
      <h2
        style={{
          fontSize: "var(--aurora-type-title-l)",
          fontWeight: 400,
          letterSpacing: "var(--aurora-tracking-title-l)",
          lineHeight: "var(--aurora-leading-title)",
          color: "var(--aurora-ink-1)",
        }}
      >
        שכבת הקליפה החדשה של Pulse
      </h2>
      <p
        style={{
          fontSize: "var(--aurora-type-body-l)",
          color: "var(--aurora-ink-2)",
          lineHeight: "var(--aurora-leading-body)",
        }}
      >
        Aurora Shell, Screen, TopBar ו-BottomNav מוכנים. גלילה למטה
        תפעיל את החשיפה של ה-TopBar עם blur. הכפתורים והטאבים
        מציגים את המצבים הפעילים אבל אינם מנתבים בשלב הזה.
      </p>
      {Array.from({ length: 18 }).map((_, i) => (
        <p
          key={i}
          style={{
            fontSize: "var(--aurora-type-body)",
            color: "var(--aurora-ink-3)",
            lineHeight: "var(--aurora-leading-body)",
          }}
        >
          שורת טקסט {i + 1} — המטרה לוודא שהגלילה חלקה, שה-TopBar
          מתעמעם ומתבהר נכון בכל גודל iPhone, ושה-BottomNav לא חוצה
          את ה-safe-area בתחתית.
        </p>
      ))}
    </article>
  );
}

function NotificationsTrigger() {
  return (
    <button
      type="button"
      aria-label="התראות"
      className="aurora-icon-button"
    >
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
      className="aurora-add-pill"
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

// Tab glyphs — minimal outlines, sized to 22px. Phase 3 may swap
// for richer iconography.
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
