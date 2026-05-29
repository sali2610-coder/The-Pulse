"use client";

// Phase 318 — Attention Center lifecycle state.
//
// Each attention item now carries one of four states: NEW (default),
// VIEWED (user has seen it and nothing has changed), RESOLVED (user
// dismissed / acted on it), SNOOZED (re-emerges after a delay). The
// state is keyed by a stable item id + a signature string. Whenever
// the signature changes (e.g. "52% מההכנסה" becomes "58% מההכנסה"),
// the item is considered NEW again so the user actually re-sees the
// fresh value.
//
// Persisted in localStorage under sally.attention.v1. Entries older
// than 60 days are pruned on load so the map can't grow unbounded.
// Pure subscribe / get / set surface — components read via the React
// hook `useAttentionVersion` and call `visibleState(id, signature)`.

import { useSyncExternalStore } from "react";

export type AttentionLifecycle = "new" | "viewed" | "resolved" | "snoozed";

type Entry = {
  state: AttentionLifecycle;
  signature: string;
  updatedAt: number;
  snoozeUntil?: number;
};

const KEY = "sally.attention.v1";
const PRUNE_AFTER_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
const SNOOZE_DEFAULT_MS = 24 * 60 * 60 * 1000;

let cache: Record<string, Entry> | null = null;
let version = 0;
const listeners = new Set<() => void>();

function load(): Record<string, Entry> {
  if (cache) return cache;
  if (typeof window === "undefined") {
    cache = {};
    return cache;
  }
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      cache = {};
      return cache;
    }
    const parsed = JSON.parse(raw) as Record<string, Entry>;
    const now = Date.now();
    const cleaned: Record<string, Entry> = {};
    for (const [id, entry] of Object.entries(parsed)) {
      if (!entry || typeof entry !== "object") continue;
      if (now - (entry.updatedAt ?? 0) > PRUNE_AFTER_MS) continue;
      cleaned[id] = entry;
    }
    cache = cleaned;
  } catch {
    cache = {};
  }
  return cache;
}

function persist(): void {
  if (typeof window === "undefined") return;
  if (!cache) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* private mode — ignore */
  }
}

function emit(): void {
  version += 1;
  for (const fn of listeners) fn();
}

function write(id: string, next: Partial<Entry>): void {
  const map = load();
  const prev = map[id] ?? {
    state: "new" as AttentionLifecycle,
    signature: "",
    updatedAt: 0,
  };
  map[id] = { ...prev, ...next, updatedAt: Date.now() };
  persist();
  emit();
}

/** Mark item as VIEWED. If signature changed since last touch, the
 *  item is re-treated as NEW first — the new signature represents a
 *  real change worth surfacing again. */
export function markViewed(id: string, signature: string): void {
  const map = load();
  const prev = map[id];
  if (prev && prev.signature !== signature) {
    // Reset cycle on signature change — caller sees NEW once.
    write(id, { state: "new", signature });
    return;
  }
  write(id, { state: "viewed", signature });
}

/** Mark item as RESOLVED (התעלם / acted). Stays resolved unless the
 *  signature changes, in which case visibleState returns NEW again. */
export function markResolved(id: string, signature: string): void {
  write(id, { state: "resolved", signature });
}

/** Snooze the item for `hours` (default 24). When the snooze window
 *  expires, visibleState returns NEW again. */
export function snooze(
  id: string,
  signature: string,
  hours: number = SNOOZE_DEFAULT_MS / (60 * 60 * 1000),
): void {
  write(id, {
    state: "snoozed",
    signature,
    snoozeUntil: Date.now() + hours * 60 * 60 * 1000,
  });
}

/** Forget the entry entirely — used for "reset for testing" only. */
export function clearAttentionState(id?: string): void {
  const map = load();
  if (id) {
    delete map[id];
  } else {
    for (const k of Object.keys(map)) delete map[k];
  }
  persist();
  emit();
}

/** Resolve the current visible state for an item — accounts for
 *  signature changes and expired snoozes. Pure read. */
export function visibleState(
  id: string,
  signature: string,
  now: number = Date.now(),
): AttentionLifecycle {
  const map = load();
  const entry = map[id];
  if (!entry) return "new";
  if (entry.signature !== signature) return "new";
  if (entry.state === "snoozed") {
    if ((entry.snoozeUntil ?? 0) <= now) return "new";
    return "snoozed";
  }
  return entry.state;
}

/** React hook — bumps on every state mutation so consumers re-render
 *  when items move between lifecycle states. */
export function useAttentionVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => version,
    () => 0,
  );
}
