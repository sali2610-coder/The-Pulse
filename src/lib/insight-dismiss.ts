// Persistent insight dismissals.
//
// Each detector card lets the user dismiss a suggestion in-session,
// but a refresh used to revive every dismissal. This module persists
// dismissals to localStorage with a sliding 7-day TTL so the user
// doesn't have to re-dismiss the same row every visit, while still
// re-surfacing it if it stays relevant a week later.
//
// Keys are namespaced per-detector + per-target id so dismissals don't
// collide across detectors (e.g. dismissing rule-drift on rule X
// doesn't also hide dormant-rule on the same X).

const STORAGE_KEY = "sally.insight.dismiss";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type DetectorKind =
  | "subscription"
  | "rule-drift"
  | "dormant-rule"
  | "budget-recommendation"
  | "stale-anchor";

type DismissalMap = Record<string, number>;

function read(): DismissalMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DismissalMap;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function write(map: DismissalMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* localStorage full or disabled — fine, dismissals fall back to session */
  }
}

function key(kind: DetectorKind, targetId: string): string {
  return `${kind}:${targetId}`;
}

const subscribers = new Set<() => void>();

function emitChange(): void {
  for (const fn of subscribers) {
    try {
      fn();
    } catch (err) {
      console.error("[insight-dismiss] subscriber threw", err);
    }
  }
}

/** Subscribe to dismissal changes. Returns an unsubscribe fn. */
export function subscribeInsightDismissals(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

export function dismissInsight(
  kind: DetectorKind,
  targetId: string,
  now: number = Date.now(),
): void {
  if (!targetId) return;
  const map = read();
  map[key(kind, targetId)] = now;
  write(map);
  emitChange();
}

export function isInsightDismissed(
  kind: DetectorKind,
  targetId: string,
  now: number = Date.now(),
): boolean {
  if (!targetId) return false;
  const map = read();
  const ts = map[key(kind, targetId)];
  if (!ts) return false;
  if (now - ts > TTL_MS) {
    // Expired — purge lazily so we don't grow the map forever.
    delete map[key(kind, targetId)];
    write(map);
    return false;
  }
  return true;
}

/** Walks the map once and trims expired entries. Cheap; called by
 *  components on mount so storage doesn't accumulate over months. */
export function pruneExpiredDismissals(now: number = Date.now()): void {
  if (typeof window === "undefined") return;
  const map = read();
  let mutated = false;
  for (const k of Object.keys(map)) {
    if (now - map[k] > TTL_MS) {
      delete map[k];
      mutated = true;
    }
  }
  if (mutated) write(map);
}

/** Test/debug helper — wipes the entire dismiss store. */
export function clearInsightDismissals(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  emitChange();
}
