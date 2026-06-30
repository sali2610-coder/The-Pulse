"use client";

// Phase 430 · AURORA v1 — TopBar
//
// 56pt sticky bar at the top of every Screen. Two visual states:
//   1. At rest (sentinel in view) — transparent, no border, no
//      shadow. The Aurora canvas shows through.
//   2. Revealed (sentinel scrolled past) — glass-elev-1 + blur-soft
//      + bottom hairline. iOS-style "blur in as you scroll".
//
// Anatomy
//   [back]   [title]                          [trailing-slots]
//
// Back affordance auto-mirrors via dir="rtl" parent: chevron-left
// glyph visually points to the right side of the screen (per
// Apple HIG critique #2 — back should mirror, not literal arrow).
//
// Title centered (Hebrew or Latin). Trailing 1–2 icon-only buttons,
// each ≥44pt tap target.
//
// Props are presentational; no routing logic. Phase 3 wires this
// to actual screens.

import { type ReactNode, useEffect, useRef, useState } from "react";

type TopBarProps = {
  /** Visible centered title. Falls back to brand mark when absent. */
  title?: ReactNode;
  /** Show back chevron + invoke this on tap. */
  onBack?: () => void;
  /** Optional trailing buttons (max 2; each must be ≥44pt). */
  trailing?: ReactNode;
  /** Element whose visibility flips the bar between transparent
   *  and revealed. Pass Screen.scrollSentinelRef's current element. */
  sentinelEl?: HTMLDivElement | null;
};

export function TopBar({
  title,
  onBack,
  trailing,
  sentinelEl,
}: TopBarProps) {
  const [revealed, setRevealed] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);

  // IntersectionObserver flips "revealed" when the sentinel leaves
  // the viewport. 0px threshold + rootMargin -24pt so the bar
  // reveals AFTER the user has scrolled ~24pt (HIG-ish feel).
  useEffect(() => {
    if (!sentinelEl) return;
    const io = new IntersectionObserver(
      ([entry]) => setRevealed(!entry.isIntersecting),
      { rootMargin: "-24px 0px 0px 0px", threshold: 0 },
    );
    io.observe(sentinelEl);
    return () => io.disconnect();
  }, [sentinelEl]);

  return (
    <header
      ref={headerRef}
      data-aurora-revealed={revealed ? "true" : "false"}
      className="aurora-top-bar sticky top-0 z-30 w-full"
      // Safe-area top padding lives on the bar itself so its glass
      // surface extends UNDER the notch when revealed.
      style={{
        paddingBlockStart: "var(--aurora-safe-top)",
      }}
    >
      <div className="aurora-top-bar-inner relative mx-auto flex items-center">
        <div className="aurora-top-bar-leading flex items-center">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="חזרה"
              className="aurora-icon-button"
            >
              <BackChevron />
            </button>
          ) : null}
        </div>
        <div className="aurora-top-bar-title flex-1 truncate text-center">
          {title ?? <BrandMark />}
        </div>
        <div className="aurora-top-bar-trailing flex items-center justify-end">
          {trailing}
        </div>
      </div>
    </header>
  );
}

// Inline glyph — RTL-aware. Visually points to the trailing edge
// of the row (right of the bar in RTL), which is "back" in Hebrew
// reading direction. Pure SVG; no icon library import.
function BackChevron() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
    >
      <path
        d="M7 5l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Pulse brand mark — placeholder typographic mark for Phase 2.
// Phase 3 may swap for a richer SVG identity.
function BrandMark() {
  return (
    <span
      className="aurora-brand-mark"
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: "var(--aurora-type-body-l)",
        fontWeight: 500,
        letterSpacing: "var(--aurora-tracking-eyebrow)",
        color: "var(--aurora-ink-1)",
      }}
    >
      Pulse
    </span>
  );
}
