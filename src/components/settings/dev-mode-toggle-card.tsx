"use client";

// Phase 231 — Developer Mode switch.
//
// Hidden at the bottom of Settings (not in a prominent header) so
// regular users don't get tempted to enable it. Flipping it on
// reveals the technical diagnostics block in the Settings tab.

import { Bug } from "lucide-react";

import { useDevMode } from "@/lib/use-dev-mode";
import { tap } from "@/lib/haptics";

export function DevModeToggleCard() {
  const { on, toggle } = useDevMode();
  return (
    <section className="rounded-2xl border border-border/40 bg-surface/30 p-5 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Bug className="size-4 text-muted-foreground" />
          <div className="flex flex-col leading-tight">
            <span className="text-[13px] font-medium text-foreground">
              מצב פיתוח
            </span>
            <span className="text-[11px] text-muted-foreground/80">
              חושף יומני אבחון, מצב Cloud Sync, מזהי מכשיר
            </span>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={() => {
            tap();
            toggle();
          }}
          className={`tap-44 flex h-7 w-12 items-center rounded-full p-0.5 transition-colors ${
            on ? "bg-[color:var(--neon)]/60" : "bg-white/15"
          }`}
        >
          <span
            className={`size-6 rounded-full bg-foreground transition-transform ${
              on ? "translate-x-0" : "translate-x-5"
            }`}
          />
        </button>
      </div>
    </section>
  );
}
