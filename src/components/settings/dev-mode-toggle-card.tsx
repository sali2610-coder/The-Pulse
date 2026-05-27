"use client";

// Phase 231 — Developer Mode switch.
//
// Hidden at the bottom of Settings (not in a prominent header) so
// regular users don't get tempted to enable it. Flipping it on
// reveals the technical diagnostics block in the Settings tab.

import { Bug } from "lucide-react";

import { useDevMode } from "@/lib/use-dev-mode";
import { BigSwitch } from "@/components/ui/big-switch";

export function DevModeToggleCard() {
  const { on, setOn } = useDevMode();
  return (
    <section className="rounded-2xl border border-border/40 bg-surface/30 p-5 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Bug className="size-4 text-muted-foreground" />
          <div className="flex flex-col leading-tight">
            <span className="text-section text-foreground">מצב פיתוח</span>
            <span className="text-caption text-muted-foreground/80">
              חושף יומני אבחון, מצב Cloud Sync, מזהי מכשיר
            </span>
          </div>
        </div>
        <BigSwitch on={on} onChange={setOn} label="הפעל מצב פיתוח" />
      </div>
    </section>
  );
}
