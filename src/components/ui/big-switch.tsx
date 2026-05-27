"use client";

// Phase 234 — premium iOS-style toggle.
//
// A consumer-friendly switch with a 32px-tall track and 28px knob,
// far more readable than the inline pill-button toggles each
// settings card was reinventing. Tap-target meets the 44×44 floor
// from Phase 226 — the visual switch sits centred inside a 44×28
// hit zone.
//
// Controlled. No store coupling — caller owns the bool.

import { tap } from "@/lib/haptics";

export function BigSwitch({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  /** Accessible label spoken to assistive tech. */
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        tap();
        onChange(!on);
      }}
      data-no-min-tap
      className={`tap-44 group relative inline-flex h-11 w-[54px] shrink-0 items-center rounded-full transition-colors duration-200 ${
        on ? "bg-[color:var(--neon)]/60" : "bg-white/15"
      } disabled:opacity-40`}
    >
      {/* Knob — positioned via logical start/end so RTL flips
          correctly without manual `translate` math. */}
      <span
        aria-hidden
        className={`absolute size-9 rounded-full bg-foreground shadow-[0_2px_6px_rgba(0,0,0,0.4)] transition-all duration-200 ${
          on ? "start-1" : "end-1"
        }`}
      />
    </button>
  );
}
