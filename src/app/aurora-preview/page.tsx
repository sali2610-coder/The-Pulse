"use client";

// Phase 432 part 3 · AURORA v1 — Aurora Home (production composition)
//
// Real Pulse dashboard. Same composition the auth-gated home at /
// mounts. /aurora-preview stays reachable without auth so the
// design can be reviewed locally without going through Supabase.

import { useRef, useState } from "react";

import { AuroraShell } from "@/components/aurora/aurora-shell";
import { Screen } from "@/components/aurora/aurora-screen";
import { TopBar } from "@/components/aurora/aurora-top-bar";
import {
  BottomNav,
  type BottomNavTab,
  type TabKey,
} from "@/components/aurora/aurora-bottom-nav";
import { AuroraHome } from "@/components/aurora/aurora-home";

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
        <AuroraHome />
      </Screen>
    </AuroraShell>
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
