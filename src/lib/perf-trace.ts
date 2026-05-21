// Performance trace primitive.
//
// Phase E of the production-foundation roadmap. Lightweight client-
// side timing harness so future work can measure (and budget against)
// real latency for the critical flows:
//
//   • Quick-add open       target: < 150 ms perceived
//   • Dashboard interactive target: < 1 s
//   • Save transaction      target: < 250 ms perceived
//   • Restore               target: < 2 s
//   • Sync round-trip       target: < 1 s
//
// API:
//   const span = beginSpan("quick-add.open");
//   ...do work...
//   span.end();           // logs duration + records in ring buffer
//
//   listSpans() returns the most recent N spans for QA inspection.
//
// Zero dependencies. No network. No DOM mutation. Falls back to
// Date.now() when performance.now() is unavailable. Cap on the ring
// buffer guarantees it can never leak memory.

const MAX_BUFFER = 100;

export type Span = {
  name: string;
  startedAt: number;
  endedAt: number;
  duration: number;
  /** Optional structured metadata for a future telemetry pipe. */
  meta?: Record<string, unknown>;
};

type ActiveSpan = {
  end: (meta?: Record<string, unknown>) => Span;
};

const ring: Span[] = [];

// Performance budget targets — read by consumers / QA tools.
export const PERF_BUDGETS = {
  "quick-add.open": 150,
  "dashboard.interactive": 1000,
  "transaction.save": 250,
  "restore.apply": 2000,
  "sync.round-trip": 1000,
  "confirmation.open": 200,
} as const;

function now(): number {
  if (typeof performance !== "undefined" && performance.now) {
    return performance.now();
  }
  return Date.now();
}

function record(span: Span): void {
  ring.push(span);
  if (ring.length > MAX_BUFFER) ring.shift();
  // DevTools timeline marker — visible in Chrome's performance tab.
  if (
    typeof performance !== "undefined" &&
    "measure" in performance &&
    typeof performance.measure === "function"
  ) {
    try {
      performance.measure(span.name, {
        start: span.startedAt,
        end: span.endedAt,
        detail: span.meta,
      });
    } catch {
      /* some browsers throw on detail — silent */
    }
  }
}

/**
 * Begin a named span. The returned object's `end()` must be called
 * to finalize the measurement. Spans that are never ended simply
 * sit in memory as the active reference; they don't pollute the
 * ring buffer.
 */
export function beginSpan(
  name: string,
  initialMeta?: Record<string, unknown>,
): ActiveSpan {
  const startedAt = now();
  return {
    end(meta) {
      const endedAt = now();
      const span: Span = {
        name,
        startedAt,
        endedAt,
        duration: endedAt - startedAt,
        meta: { ...initialMeta, ...meta },
      };
      record(span);
      return span;
    },
  };
}

/** Convenience: wrap an async function, measure, surface the result. */
export async function measureAsync<T>(
  name: string,
  fn: () => Promise<T>,
  meta?: Record<string, unknown>,
): Promise<{ result: T; span: Span }> {
  const handle = beginSpan(name, meta);
  const result = await fn();
  const span = handle.end();
  return { result, span };
}

/** Newest-first list of recorded spans. Used by QA + the future
 *  performance overlay. */
export function listSpans(): readonly Span[] {
  return ring.slice().reverse();
}

/** True when the span exceeded its declared budget (if any). */
export function isOverBudget(span: Span): boolean {
  const budget = PERF_BUDGETS[span.name as keyof typeof PERF_BUDGETS];
  if (typeof budget !== "number") return false;
  return span.duration > budget;
}

/** Clear the ring buffer — used by QA harnesses between scenarios. */
export function clearSpans(): void {
  ring.length = 0;
}
