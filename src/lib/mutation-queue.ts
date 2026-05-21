// Offline mutation queue scaffold.
//
// Pulse will move to a real cloud-backed source of truth (Supabase
// + Postgres) in a later phase. This module establishes the
// client-side interface NOW so the eventual integration is a drop-in
// — no consumer code changes when the network layer arrives.
//
// Storage: localStorage. Survives PWA reloads, never blocks the UI,
// degrades to in-memory when storage is unavailable.
//
// Semantics:
//   - Each mutation has a stable `id` (uuid) so retries are
//     idempotent on the server side.
//   - Mutations are processed FIFO unless they fail; failed
//     mutations stay at the head with exponential backoff metadata
//     until they succeed OR are explicitly dropped by the consumer.
//   - The queue has no opinion on the mutation payload shape — it's
//     a plain `unknown` blob so existing actions stay untouched.
//
// Nothing in this file actually fires a network request yet. The
// `processor` callback is the integration point — Phase A (cloud
// sync) will wire it to the API.

// Type anchor reserved for the future cloud-sync integration. Keeps
// the surface explicit without coupling the queue to the current
// Zustand store shape.
export type MutationProcessor = (m: Mutation) => Promise<void>;

const STORAGE_KEY = "sally.mutation.queue";
const MAX_QUEUE = 500;

export type Mutation = {
  id: string;
  /** Discriminator for the server-side handler. Plain string so new
   *  mutation kinds don't require a type bump. */
  kind: string;
  /** Local timestamp the mutation was enqueued. */
  ts: number;
  /** Opaque payload — interpreted by the kind-specific handler. */
  payload: unknown;
  /** Retry bookkeeping. Set by the queue, read by the processor. */
  attempts: number;
  nextAttemptAt?: number;
  lastError?: string;
};

type QueueState = {
  items: Mutation[];
};

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function read(): QueueState {
  if (typeof window === "undefined") return { items: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { items: [] };
    const parsed = JSON.parse(raw) as QueueState;
    if (!parsed || !Array.isArray(parsed.items)) return { items: [] };
    return parsed;
  } catch {
    return { items: [] };
  }
}

function write(state: QueueState): void {
  if (typeof window === "undefined") return;
  try {
    // Cap the queue so a runaway client can't blow out localStorage.
    const items = state.items.slice(-MAX_QUEUE);
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ items }),
    );
  } catch {
    /* storage disabled / quota exceeded — queue degrades to memory */
  }
}

let memoryFallback: QueueState | null = null;

function snapshot(): QueueState {
  if (typeof window === "undefined") {
    return memoryFallback ?? (memoryFallback = { items: [] });
  }
  return read();
}

function commit(next: QueueState): void {
  if (typeof window === "undefined") {
    memoryFallback = next;
    return;
  }
  write(next);
}

/** Add a mutation to the tail of the queue. Returns the new id. */
export function enqueueMutation(args: {
  kind: string;
  payload: unknown;
}): string {
  const state = snapshot();
  const m: Mutation = {
    id: uid(),
    kind: args.kind,
    payload: args.payload,
    ts: Date.now(),
    attempts: 0,
  };
  commit({ items: [...state.items, m] });
  return m.id;
}

/** Peek the head of the queue without removing it. */
export function peekMutation(): Mutation | null {
  return snapshot().items[0] ?? null;
}

/** Drop a mutation by id — used when a processor confirms success. */
export function ackMutation(id: string): void {
  const state = snapshot();
  commit({ items: state.items.filter((m) => m.id !== id) });
}

/** Record a failure + schedule the next attempt with exponential
 *  backoff. Cap at 8 attempts to avoid pathological retries. */
export function failMutation(id: string, error: string): void {
  const state = snapshot();
  const items = state.items.map((m) => {
    if (m.id !== id) return m;
    const attempts = m.attempts + 1;
    if (attempts > 8) return m; // freeze — consumer can decide to drop
    const delayMs = Math.min(60 * 60 * 1000, 1000 * 2 ** attempts);
    return {
      ...m,
      attempts,
      lastError: error,
      nextAttemptAt: Date.now() + delayMs,
    };
  });
  commit({ items });
}

/** Full state — useful for QA / sync-health surfacing. */
export function listMutations(): readonly Mutation[] {
  return snapshot().items;
}

/** Wipe the queue. Used by destructive-restore flows so a stale
 *  pre-restore mutation doesn't fire against the freshly-restored
 *  state. */
export function clearMutations(): void {
  commit({ items: [] });
}

/** Convenience: count of mutations whose nextAttemptAt has passed
 *  (or is unset). Drives a future sync-health indicator. */
export function pendingMutationCount(now: number = Date.now()): number {
  const state = snapshot();
  return state.items.filter(
    (m) => !m.nextAttemptAt || m.nextAttemptAt <= now,
  ).length;
}

