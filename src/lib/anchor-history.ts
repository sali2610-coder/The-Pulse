// Phase 218 — anchor history.
//
// Every manual bank-balance update gets appended to localStorage so
// the dashboard can show a balance trajectory over the last 30/90
// days. Local-only on purpose: avoids a Supabase schema touch and
// keeps the surface lightweight. Cap at 1000 points to bound the
// storage footprint; oldest-first dropoff.

const STORAGE_KEY = "sally.anchor-history.v1";
const MAX_POINTS = 1000;

export type AnchorHistoryPoint = {
  /** Account.id the update was for. */
  accountId: string;
  /** Hebrew display label captured at write time so historical rows
   *  keep their context even if the user renames the account later. */
  label: string;
  /** ILS — may be negative. */
  balance: number;
  /** ISO timestamp the user saved the value. */
  at: string;
};

function readAll(): AnchorHistoryPoint[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPoint);
  } catch {
    return [];
  }
}

function writeAll(points: AnchorHistoryPoint[]): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed =
      points.length > MAX_POINTS ? points.slice(-MAX_POINTS) : points;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* quota / disabled storage — silent */
  }
}

/** Record a balance update. De-dups when the same account+balance
 *  was written within the last 60 seconds (typical: user types,
 *  saves, then changes their mind and saves the same value). */
export function appendAnchorPoint(point: {
  accountId: string;
  label: string;
  balance: number;
  at?: string;
}): void {
  const at = point.at ?? new Date().toISOString();
  const all = readAll();
  const last = all
    .slice()
    .reverse()
    .find((p) => p.accountId === point.accountId);
  if (
    last &&
    last.balance === point.balance &&
    Date.now() - new Date(last.at).getTime() < 60_000
  ) {
    return; // duplicate-within-window
  }
  all.push({
    accountId: point.accountId,
    label: point.label,
    balance: point.balance,
    at,
  });
  writeAll(all);
}

export function readAnchorHistory(): AnchorHistoryPoint[] {
  return readAll();
}

export function readAnchorHistoryForAccount(
  accountId: string,
): AnchorHistoryPoint[] {
  return readAll().filter((p) => p.accountId === accountId);
}

export type TrajectoryPoint = {
  whenISO: string;
  balance: number;
};

/** Build a per-day trajectory of TOTAL anchor balance across every
 *  account, carrying the latest known balance forward for missing
 *  days. Caller picks the window (default 30 days). */
export function buildAnchorTrajectory(args: {
  history?: AnchorHistoryPoint[];
  now?: Date;
  windowDays?: number;
}): TrajectoryPoint[] {
  const now = args.now ?? new Date();
  const windowDays = Math.max(1, args.windowDays ?? 30);
  const history = (args.history ?? readAll())
    .slice()
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  if (history.length === 0) return [];

  // Per-account last-known balance, carried forward day-by-day.
  const perAccount = new Map<string, number>();
  // Apply every history point in order so perAccount holds "as of
  // the earliest day in window" by the time we start emitting.
  const startMs = startOfDay(now).getTime() - (windowDays - 1) * 86_400_000;

  // Seed perAccount with anything older than the window so the
  // trajectory's first day is anchored properly.
  for (const p of history) {
    const t = new Date(p.at).getTime();
    if (t >= startMs) break;
    perAccount.set(p.accountId, p.balance);
  }

  const points: TrajectoryPoint[] = [];
  let cursor = new Date(startMs);
  cursor.setHours(12, 0, 0, 0);
  for (let i = 0; i < windowDays; i++) {
    const dayEnd = startOfDay(cursor).getTime() + 86_400_000;
    for (const p of history) {
      const t = new Date(p.at).getTime();
      if (t < dayEnd && t >= dayEnd - 86_400_000) {
        perAccount.set(p.accountId, p.balance);
      }
    }
    const total = Array.from(perAccount.values()).reduce(
      (acc, v) => acc + v,
      0,
    );
    points.push({ whenISO: cursor.toISOString(), balance: round2(total) });
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return points;
}

export function _resetAnchorHistoryForTests(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function isPoint(v: unknown): v is AnchorHistoryPoint {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.accountId === "string" &&
    typeof p.label === "string" &&
    typeof p.balance === "number" &&
    typeof p.at === "string"
  );
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
