// Single source of truth for the "open the pending-confirm overlay"
// signal.
//
// Every entry-point (SW postMessage, /api/push/click beacon, /confirm
// deep-link, settings test button) calls `openPendingConfirmation` with
// a stable externalId. Subscribers — currently the PendingConfirmOverlay
// portal mounted at AppShell level — receive the externalId and decide
// what to render.
//
// We keep this in a tiny pub-sub instead of a Zustand slice so the
// channel is decoupled from financial state. Subscribers can listen
// without owning store concerns, and entry-points can fire-and-forget
// without knowing whether the overlay has mounted yet (we replay the
// latest pending externalId on subscribe to cover cold mounts).

type PendingConfirmEvent = {
  externalId: string;
  /** ms timestamp; used to ignore stale signals after long backgrounding. */
  ts: number;
};

type Listener = (event: PendingConfirmEvent) => void;

const STORAGE_KEY = "sally.pending.confirm";
const STALE_MS = 5 * 60 * 1000;

const listeners = new Set<Listener>();
let latest: PendingConfirmEvent | null = null;

function persistToSession(event: PendingConfirmEvent) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(event));
  } catch {
    /* sessionStorage disabled — fine */
  }
}

function readFromSession(): PendingConfirmEvent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingConfirmEvent;
    if (!parsed?.externalId) return null;
    if (Date.now() - parsed.ts > STALE_MS) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function clearSession() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Open the pending-confirm overlay for `externalId`. Safe to call from
 * any context (event handler, async fetch, cold mount). When called
 * before the overlay subscribes, the event is persisted to
 * sessionStorage and replayed when subscription happens.
 */
export function openPendingConfirmation(externalId: string): void {
  if (!externalId) return;
  const event: PendingConfirmEvent = { externalId, ts: Date.now() };
  latest = event;
  persistToSession(event);
  for (const fn of listeners) {
    try {
      fn(event);
    } catch (err) {
      console.error("[pending-confirm-channel] listener threw", err);
    }
  }
}

/**
 * Subscribe to pending-confirm signals. Returns an unsubscribe fn.
 * If a signal arrived before subscription (e.g., cold PWA mount after
 * notification tap), it is replayed once on subscribe.
 */
export function subscribePendingConfirmation(fn: Listener): () => void {
  listeners.add(fn);
  // Replay the freshest signal — prefer the in-memory `latest` (set by
  // an open call in the same tab) over sessionStorage so the listener
  // always sees the newest signal exactly once.
  const replay = latest ?? readFromSession();
  if (replay && Date.now() - replay.ts <= STALE_MS) {
    queueMicrotask(() => fn(replay));
  }
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Mark the latest pending-confirm signal as consumed. The overlay calls
 * this once it has rendered for the matching externalId so a refresh
 * doesn't re-open it.
 */
export function ackPendingConfirmation(externalId: string): void {
  if (!externalId) return;
  if (latest?.externalId === externalId) latest = null;
  const stored = readFromSession();
  if (stored?.externalId === externalId) clearSession();
}
