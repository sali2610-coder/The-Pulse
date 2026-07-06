"use client";

// Settings tab — thin shell over SettingsShell.
//
// UI-only redesign: the previous accordion list is replaced by
// a card-grid Settings surface. Every existing mini-app, card
// and diagnostic component is mounted inside a BottomSheet
// keyed to a card row. Store surface, engines, APIs, and
// persistence paths are all untouched.

import { SettingsShell } from "./settings-shell";

export function SettingsTab() {
  return <SettingsShell />;
}
