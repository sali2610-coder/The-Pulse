"use client";

// Phase 411 — iOS Shortcut folder as a mini-app.
//
// Existing ShortcutHealthCard already carries the test-ping CTA +
// event timeline. ShortcutOnboardingCard surfaces once the user
// hasn't set up the shortcut yet. Mini-app composes both under a
// minimal hero so the folder reads as one product instead of two
// stacked cards.

import { Zap } from "lucide-react";

import { MiniAppStatusHero } from "@/components/ui/mini-app-shell";
import { ShortcutHealthCard } from "@/components/settings/shortcut-health-card";
import { ShortcutOnboardingCard } from "@/components/settings/shortcut-onboarding-card";

export function ShortcutMiniApp() {
  return (
    <div className="flex flex-col gap-3" dir="rtl">
      <MiniAppStatusHero
        tone="#22D3EE"
        icon={Zap}
        title="קיצור iOS"
        detail="קולט אוטומטית חיובי CAL / MAX / Wallet → אפליקציית Sally בלייב."
      />
      <ShortcutHealthCard />
      <ShortcutOnboardingCard />
    </div>
  );
}
