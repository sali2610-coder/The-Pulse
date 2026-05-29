"use client";

// Phase 294 — singleton "open" state for the Attention Center bottom
// sheet. Lives outside any one component so the Home tab badge
// banner, the TodayPulseCard chip, and any future surface (status
// bar, push notification handler) can all open it without prop
// drilling. Same shape as `tab-nav`'s subscribe model.

import { useSyncExternalStore } from "react";

let open = false;
const listeners = new Set<() => void>();

export function openAttentionCenter(): void {
  open = true;
  for (const fn of listeners) fn();
}

export function closeAttentionCenter(): void {
  open = false;
  for (const fn of listeners) fn();
}

export function setAttentionCenterOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  for (const fn of listeners) fn();
}

export function useAttentionCenter(): {
  open: boolean;
  setOpen: (next: boolean) => void;
} {
  const value = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => open,
    () => false,
  );
  return { open: value, setOpen: setAttentionCenterOpen };
}
