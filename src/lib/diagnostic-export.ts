// Diagnostic report builder.
//
// Bundles every local diagnostic surface into one sanitized
// JSON object the user can save + attach to a bug report. NO
// PII — no merchant text, no amounts, no email, no user-id.
// What we include:
//   - app build info (version + build time if available)
//   - browser / device fingerprint (UA, language, online state)
//   - cache ownership tag (for multi-user isolation diagnosis)
//   - recent errors (LoggedError[])
//   - recent analytics events (AnalyticsEvent[])
//   - safety snapshot counts (NOT payloads)
//   - net-worth snapshot count
//   - localStorage byte usage estimate
//
// Pure compute. Safe to call from anywhere; SSR-side returns a
// shaped object with empty arrays.

import { listErrors, type LoggedError } from "@/lib/error-log";
import { listEvents, type AnalyticsEvent } from "@/lib/analytics";
import {
  listSafetyBackups,
  readCacheOwner,
} from "@/lib/local-safety-snapshots";
import { listSnapshots as listNetWorthSnapshots } from "@/lib/net-worth-history";

export type DiagnosticReport = {
  generatedAt: number;
  app: {
    /** Filled at build time via process.env when available. */
    nodeEnv?: string;
  };
  browser: {
    userAgent: string;
    language: string;
    online: boolean;
    timezone: string;
    cookiesEnabled: boolean;
  };
  cache: {
    /** Truncated owner id (first 8 chars) — never the full
     *  Supabase user id. */
    ownerHash: string | null;
  };
  storage: {
    localStorageBytes: number; // best-effort estimate
  };
  counts: {
    errors: number;
    analyticsEvents: number;
    safetySnapshots: number;
    netWorthSnapshots: number;
  };
  errors: LoggedError[];
  events: AnalyticsEvent[];
};

function estimateLocalStorageBytes(): number {
  if (typeof window === "undefined") return 0;
  let bytes = 0;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k === null) continue;
      const v = window.localStorage.getItem(k) ?? "";
      bytes += k.length + v.length;
    }
  } catch {
    /* quota / disabled — return what we have */
  }
  // 2 bytes per char (UTF-16) is the JS spec.
  return bytes * 2;
}

function shortenOwner(s: string | null): string | null {
  if (!s) return null;
  return s.length > 8 ? s.slice(0, 8) + "…" : s;
}

export function buildDiagnosticReport(): DiagnosticReport {
  const errors = listErrors();
  const events = listEvents();
  const safety = listSafetyBackups();
  const networth = listNetWorthSnapshots();
  const ssr = typeof window === "undefined";
  return {
    generatedAt: Date.now(),
    app: {
      nodeEnv: process.env.NODE_ENV,
    },
    browser: {
      userAgent: ssr ? "ssr" : navigator.userAgent,
      language: ssr ? "" : navigator.language,
      online: ssr ? true : navigator.onLine,
      timezone: ssr ? "" : Intl.DateTimeFormat().resolvedOptions().timeZone,
      cookiesEnabled: ssr ? false : navigator.cookieEnabled,
    },
    cache: {
      ownerHash: shortenOwner(readCacheOwner()),
    },
    storage: {
      localStorageBytes: estimateLocalStorageBytes(),
    },
    counts: {
      errors: errors.length,
      analyticsEvents: events.length,
      safetySnapshots: safety.length,
      netWorthSnapshots: networth.length,
    },
    // Cap the embedded arrays so the JSON stays small enough to
    // paste into a bug report.
    errors: errors.slice(0, 20),
    events: events.slice(0, 50),
  };
}

/** Browser-only download trigger. SSR-side is a no-op. */
export function downloadDiagnosticReport(filename?: string): void {
  if (typeof window === "undefined") return;
  const report = buildDiagnosticReport();
  const stamp = new Date(report.generatedAt)
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? `sally-diagnostic-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
