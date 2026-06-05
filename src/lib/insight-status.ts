// Phase 383 — insight status (new / read / resolved) + auto-cleanup.
//
// State lives in localStorage. No engine touch. Pure helper used by
// the InsightsTab to:
//   • mark an insight read when opened
//   • mark an insight resolved when the user acts
//   • auto-archive read > 14 days, resolved > 7 days
// Returns the canonical status the UI should render right now.

const STORAGE_KEY = "sally.insight-status.v1";

export type InsightStatusKind = "new" | "read" | "resolved";

type Record = {
  /** Status assigned by the user. */
  status: InsightStatusKind;
  /** ms epoch of the last status transition. */
  at: number;
};

type StatusMap = { [insightId: string]: Record };

function load(): StatusMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StatusMap;
    if (parsed && typeof parsed === "object") return parsed;
    return {};
  } catch {
    return {};
  }
}

function save(map: StatusMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota exceeded → drop silently */
  }
}

const READ_AGE_MS = 14 * 86_400_000;
const RESOLVED_AGE_MS = 7 * 86_400_000;

/** Returns the status of an insight after applying auto-cleanup. */
export function statusOf(
  insightId: string,
  now: number = Date.now(),
): InsightStatusKind {
  const map = load();
  const rec = map[insightId];
  if (!rec) return "new";
  if (rec.status === "read" && now - rec.at > READ_AGE_MS) {
    // Auto-archive: treat as "resolved" so the gate filter drops it.
    return "resolved";
  }
  return rec.status;
}

/** Mark an insight as read (idempotent — preserves resolved). */
export function markRead(insightId: string, now: number = Date.now()): void {
  const map = load();
  const prev = map[insightId];
  if (prev?.status === "resolved") return;
  map[insightId] = { status: "read", at: now };
  save(map);
}

/** Mark an insight as resolved by user action. */
export function markResolved(
  insightId: string,
  now: number = Date.now(),
): void {
  const map = load();
  map[insightId] = { status: "resolved", at: now };
  save(map);
}

/** Should an insight be hidden by the auto-cleanup rules?
 *  - read > 14 days → archive
 *  - resolved > 7 days → archive
 */
export function isArchived(
  insightId: string,
  now: number = Date.now(),
): boolean {
  const map = load();
  const rec = map[insightId];
  if (!rec) return false;
  if (rec.status === "read") return now - rec.at > READ_AGE_MS;
  if (rec.status === "resolved") return now - rec.at > RESOLVED_AGE_MS;
  return false;
}

/** Used by InsightsTab to subscribe to changes. */
export function subscribe(fn: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) fn();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

/** Debug / tests: clear everything. */
export function clearAll(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}
