"use client";

// Phase 430 · AURORA v1 — BottomNav
//
// 84pt fixed bar at the bottom of every screen (incl. safe-area).
//
// 5-cell grid (RTL): Home / Activity / [Add cutout] / Timeline /
// Settings. The center cell is a 64×64pt cutout — the Add button
// floats above the bar and dives into that cutout so its tap
// surface never overlaps an adjacent tab (HIG critique #5).
//
// Active tab: 8pt Aurora ring underline + label weight stays
// regular (HIG critique #15 — single signal, not double).
//
// Pure presentational. Tab change is invoked via onChange; routing
// lives in the parent.

import { type ReactNode } from "react";

export type TabKey = "home" | "activity" | "timeline" | "settings";

export type BottomNavTab = {
  key: TabKey;
  label: string;
  icon: ReactNode;
};

type BottomNavProps = {
  tabs: BottomNavTab[];
  active: TabKey;
  onChange: (next: TabKey) => void;
  /** Slot for the floating Add button. Anchored above the center
   *  cutout. Rendered untouched — caller controls behavior. */
  addSlot?: ReactNode;
};

export function BottomNav({
  tabs,
  active,
  onChange,
  addSlot,
}: BottomNavProps) {
  // RTL: in the design the visual order is [Home, Activity, Add,
  // Timeline, Settings] reading right→left. We render in array
  // order; `dir="rtl"` on the parent does the mirror automatically.
  const [a, b, c, d] = tabs;
  return (
    <nav
      role="tablist"
      aria-label="ניווט ראשי"
      className="aurora-bottom-nav fixed inset-x-0 bottom-0 z-40"
      style={{
        paddingBlockEnd: "var(--aurora-safe-bottom)",
      }}
    >
      <div className="aurora-bottom-nav-inner relative mx-auto">
        <ul className="aurora-bottom-nav-grid grid grid-cols-5">
          <li>
            <NavCell tab={a} active={active === a.key} onSelect={onChange} />
          </li>
          <li>
            <NavCell tab={b} active={active === b.key} onSelect={onChange} />
          </li>
          {/* Center cutout — empty cell. The floating Add button
              sits ABOVE this cell, anchored via the addSlot below. */}
          <li aria-hidden className="aurora-bottom-nav-cutout" />
          <li>
            <NavCell tab={c} active={active === c.key} onSelect={onChange} />
          </li>
          <li>
            <NavCell tab={d} active={active === d.key} onSelect={onChange} />
          </li>
        </ul>
        {addSlot ? (
          <div className="aurora-bottom-nav-add-slot pointer-events-none absolute inset-x-0 -top-7 flex justify-center">
            <div className="aurora-bottom-nav-add-pill pointer-events-auto">
              {addSlot}
            </div>
          </div>
        ) : null}
      </div>
    </nav>
  );
}

function NavCell({
  tab,
  active,
  onSelect,
}: {
  tab: BottomNavTab;
  active: boolean;
  onSelect: (k: TabKey) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={tab.label}
      onClick={() => onSelect(tab.key)}
      className="aurora-nav-cell"
      data-aurora-active={active ? "true" : "false"}
    >
      <span aria-hidden className="aurora-nav-cell-icon">
        {tab.icon}
      </span>
      <span className="aurora-nav-cell-label">{tab.label}</span>
    </button>
  );
}
