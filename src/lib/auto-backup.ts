"use client";

import { useEffect } from "react";

import { useFinanceStore } from "@/lib/store";

const STORAGE_KEY = "sally.lastAutoBackup";
const INTERVAL_MS = 24 * 60 * 60 * 1000;

function readLastBackupTs(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeLastBackupTs(ts: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(ts));
  } catch {
    /* full / disabled — auto-backup degrades to once-per-session */
  }
}

/**
 * Fires a `POST /api/backups` with reason="auto" at most once every
 * 24 hours, only when the local store has at least one meaningful
 * entity. The server route already rejects empty-state backups, but
 * checking client-side avoids a needless network round-trip on fresh
 * installs.
 *
 * Failures are silent — auto-backup is a safety net, not a hard
 * dependency. The manual button in the settings card always works.
 */
export function useAutoBackup(): void {
  const hydrated = useFinanceStore((s) => s.hasHydrated);

  useEffect(() => {
    if (!hydrated) return;
    if (typeof window === "undefined") return;

    let cancelled = false;
    Promise.resolve().then(async () => {
      if (cancelled) return;
      const lastTs = readLastBackupTs();
      const now = Date.now();
      if (now - lastTs < INTERVAL_MS) return;

      const s = useFinanceStore.getState();
      const richness =
        s.entries.length +
        s.accounts.length +
        s.loans.length +
        s.incomes.length +
        s.rules.length +
        (s.monthlyBudget > 0 ? 1 : 0);
      if (richness === 0) return;

      try {
        const res = await fetch("/api/backups", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "auto" }),
        });
        if (cancelled) return;
        if (res.ok) {
          writeLastBackupTs(now);
        }
        // 401 / 503 / 4xx — silently skip; next mount will retry
        // after the regular interval.
      } catch {
        /* offline — skip silently */
      }
    });

    return () => {
      cancelled = true;
    };
  }, [hydrated]);
}
