// Lightweight correction store — UX foundation only.
//
// Records user corrections to localStorage so future sessions remember
// "this looks wrong" hints. Does NOT mutate the entry log or the
// store today — a future learning system will read these to build
// suggestions, but for now the only consumer is the correction sheet
// itself (so users can see what they've flagged).
//
// Layout: a single localStorage key holding a JSON array of
// CorrectionRecord, capped at 200 entries (newest first dropoff).
// Bounded so the localStorage budget can't be exhausted.

import type { CategoryId } from "@/lib/categories";

export type CorrectionKind =
  | "wrong_category"
  | "not_recurring"
  | "exclude_from_forecast";

export type CorrectionRecord = {
  /** Stable id (UUID-shape; doesn't have to be cryptographically strong). */
  id: string;
  /** Entry / rule the correction is about. */
  targetId: string;
  /** What kind of target this is — drives the surface text. */
  targetKind: "entry" | "rule";
  kind: CorrectionKind;
  /** ISO timestamp the correction was recorded. */
  at: string;
  /** Free-text Hebrew note the user supplied. Optional. */
  note?: string;
  /** When kind === "wrong_category", the category the user picked. */
  suggestedCategory?: CategoryId;
};

const STORAGE_KEY = "sally.corrections.v1";
const MAX_RECORDS = 200;

function readAll(): CorrectionRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCorrectionRecord);
  } catch {
    return [];
  }
}

function writeAll(records: CorrectionRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = records.slice(0, MAX_RECORDS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* quota / disabled storage → silent no-op */
  }
}

export function listCorrections(): CorrectionRecord[] {
  return readAll();
}

export function recordCorrection(
  partial: Omit<CorrectionRecord, "id" | "at">,
): CorrectionRecord {
  const record: CorrectionRecord = {
    id: cryptoRandomId(),
    at: new Date().toISOString(),
    ...partial,
  };
  const next = [record, ...readAll()];
  writeAll(next);
  return record;
}

export function removeCorrection(id: string): void {
  writeAll(readAll().filter((r) => r.id !== id));
}

export function hasCorrectionFor(targetId: string): boolean {
  return readAll().some((r) => r.targetId === targetId);
}

export function _resetCorrectionsForTests(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function isCorrectionRecord(v: unknown): v is CorrectionRecord {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.targetId === "string" &&
    typeof r.at === "string" &&
    (r.targetKind === "entry" || r.targetKind === "rule") &&
    (r.kind === "wrong_category" ||
      r.kind === "not_recurring" ||
      r.kind === "exclude_from_forecast")
  );
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
