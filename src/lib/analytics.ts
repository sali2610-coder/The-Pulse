// Local-only analytics scaffold.
//
// Phase 5 telemetry — symmetric to error-log.ts but for product
// events (sign-in, expense added, restore performed). No external
// SDK. Persists FIFO in localStorage so a user can inspect their
// own session and attach the log to a feedback report without any
// network. A future PostHog/Plausible wrapper plugs into the same
// surface without changing consumers.
//
// Privacy: events carry STRUCTURED, COARSE properties (counts,
// booleans, category ids) — never merchant text, amounts, or
// anything PII-grade. The captureEvent helper sanitizes props
// before persisting.

const STORAGE_KEY = "sally.analytics.v1";
const MAX_ENTRIES = 200;

export type AnalyticsProp = string | number | boolean;

export type AnalyticsEvent = {
  id: string;
  at: number;
  name: string;
  props?: Record<string, AnalyticsProp>;
};

type Listener = (ev: AnalyticsEvent) => void;
const listeners: Set<Listener> = new Set();

function readAll(): AnalyticsEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as AnalyticsEvent[];
  } catch {
    return [];
  }
}

function writeAll(list: AnalyticsEvent[]): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = list.slice(-MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* quota / disabled — degrade silently */
  }
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Strip anything that isn't string/number/boolean. PII / objects /
 *  arrays silently dropped so we never accidentally persist
 *  amounts or merchant text. */
function sanitizeProps(
  props: Record<string, unknown> | undefined,
): Record<string, AnalyticsProp> | undefined {
  if (!props) return undefined;
  const out: Record<string, AnalyticsProp> = {};
  let hasAny = false;
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
      hasAny = true;
    }
  }
  return hasAny ? out : undefined;
}

export function captureEvent(
  name: string,
  props?: Record<string, unknown>,
): AnalyticsEvent {
  const ev: AnalyticsEvent = {
    id: uid(),
    at: Date.now(),
    name,
    props: sanitizeProps(props),
  };
  const list = readAll();
  list.push(ev);
  writeAll(list);
  for (const fn of listeners) {
    try {
      fn(ev);
    } catch {
      /* listener crashed — don't recurse */
    }
  }
  return ev;
}

/** Newest-first view of the persisted log. */
export function listEvents(): AnalyticsEvent[] {
  return readAll()
    .slice()
    .sort((a, b) => b.at - a.at);
}

export function clearEvents(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function subscribeEvents(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Test/dev helper — clears every recorded event + every listener. */
export function _resetAnalyticsForTests(): void {
  clearEvents();
  listeners.clear();
}
