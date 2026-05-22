// Client-side error log.
//
// Phase 5 production-monitoring scaffold. No external SDK — errors
// persist to localStorage so the user can attach the last N entries
// to a bug report without any network. SafetyDiagnostics surfaces
// the latest entries; consumers can also subscribe via
// `subscribeErrors` to react to live failures (e.g. show a toast
// in dev).
//
// Pure module — safe to import server-side; SSR-side reads return
// the empty array. Capped FIFO at 50 to bound localStorage growth.

const STORAGE_KEY = "sally.errorlog.v1";
const MAX_ENTRIES = 50;

export type LoggedError = {
  id: string;
  at: number;
  source: "unhandled" | "promise" | "manual" | "boundary";
  message: string;
  stack?: string;
  /** Context the caller supplied — surface name, route, etc. */
  ctx?: Record<string, string | number | boolean>;
};

type Listener = (err: LoggedError) => void;
const listeners: Set<Listener> = new Set();

function readAll(): LoggedError[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as LoggedError[];
  } catch {
    return [];
  }
}

function writeAll(list: LoggedError[]): void {
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
  return `err-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function captureError(
  err: unknown,
  source: LoggedError["source"] = "manual",
  ctx?: LoggedError["ctx"],
): LoggedError {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "unknown_error";
  const stack = err instanceof Error ? err.stack : undefined;
  const entry: LoggedError = {
    id: uid(),
    at: Date.now(),
    source,
    message,
    stack,
    ctx,
  };
  const list = readAll();
  list.push(entry);
  writeAll(list);
  for (const fn of listeners) {
    try {
      fn(entry);
    } catch {
      /* listener crashed — don't recurse */
    }
  }
  return entry;
}

/** Newest-first view of the persisted log. */
export function listErrors(): LoggedError[] {
  return readAll()
    .slice()
    .sort((a, b) => b.at - a.at);
}

export function clearErrors(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function subscribeErrors(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Install global handlers — call once at app shell mount. Returns
 *  a cleanup function suitable for useEffect cleanup. Idempotent
 *  across re-mounts: each instance owns its own handler refs so
 *  removing them is safe. */
export function installGlobalErrorHandlers(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onError = (ev: ErrorEvent) => {
    captureError(ev.error ?? ev.message, "unhandled", {
      filename: ev.filename ?? "",
      lineno: ev.lineno ?? 0,
      colno: ev.colno ?? 0,
    });
  };
  const onRejection = (ev: PromiseRejectionEvent) => {
    captureError(ev.reason, "promise");
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}

/** Test/dev helper — clears every recorded entry. */
export function _resetErrorLogForTests(): void {
  clearErrors();
  listeners.clear();
}
