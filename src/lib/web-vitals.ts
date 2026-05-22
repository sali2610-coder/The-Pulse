// Core Web Vitals collector.
//
// Phase 5 production monitoring. Captures LCP / CLS / FCP / TTFB
// natively via PerformanceObserver — no `web-vitals` npm dep —
// and emits each result through the existing analytics module so
// they land in the local event log + any future telemetry sink.
//
// Pure browser API. SSR-side calls are a no-op.
// Idempotent — multiple installs return distinct cleanup fns; the
// PerformanceObserver instances are independent.

import { captureEvent } from "@/lib/analytics";

export type WebVitalMetric = "LCP" | "CLS" | "FCP" | "TTFB";
export type WebVitalRating = "good" | "needs-improvement" | "poor";

const THRESHOLDS: Record<
  WebVitalMetric,
  { good: number; needsImprovement: number }
> = {
  // Source: https://web.dev/articles/vitals (Mar 2024).
  LCP: { good: 2500, needsImprovement: 4000 },
  CLS: { good: 0.1, needsImprovement: 0.25 },
  FCP: { good: 1800, needsImprovement: 3000 },
  TTFB: { good: 800, needsImprovement: 1800 },
};

/** Pure: classify a metric value into a rating bucket. Exported so
 *  the unit suite can pin the policy. */
export function rateMetric(
  metric: WebVitalMetric,
  value: number,
): WebVitalRating {
  const t = THRESHOLDS[metric];
  if (value <= t.good) return "good";
  if (value <= t.needsImprovement) return "needs-improvement";
  return "poor";
}

function reportMetric(metric: WebVitalMetric, value: number): void {
  const rounded =
    metric === "CLS" ? Math.round(value * 1000) / 1000 : Math.round(value);
  try {
    captureEvent("web_vital", {
      metric,
      value: rounded,
      rating: rateMetric(metric, value),
    });
  } catch {
    /* analytics never blocks measurement */
  }
}

/** Install PerformanceObservers for the supported metrics. Returns
 *  a cleanup function suitable for useEffect cleanup. */
export function installWebVitals(): () => void {
  if (typeof window === "undefined") return () => undefined;
  if (typeof PerformanceObserver === "undefined") return () => undefined;

  const observers: PerformanceObserver[] = [];

  // LCP — the LATEST entry before page hidden / interaction wins.
  let lcpValue = 0;
  try {
    const po = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1] as
        | (PerformanceEntry & { renderTime?: number; loadTime?: number })
        | undefined;
      if (!last) return;
      lcpValue = last.renderTime ?? last.loadTime ?? last.startTime;
    });
    po.observe({ type: "largest-contentful-paint", buffered: true });
    observers.push(po);
  } catch {
    /* unsupported */
  }

  // CLS — sum of unexpected layout shifts (without recent user input).
  let clsValue = 0;
  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const ls = entry as PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
        };
        if (ls.hadRecentInput) continue;
        clsValue += ls.value;
      }
    });
    po.observe({ type: "layout-shift", buffered: true });
    observers.push(po);
  } catch {
    /* unsupported */
  }

  // FCP — first contentful paint. One-shot.
  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === "first-contentful-paint") {
          reportMetric("FCP", entry.startTime);
          po.disconnect();
        }
      }
    });
    po.observe({ type: "paint", buffered: true });
    observers.push(po);
  } catch {
    /* unsupported */
  }

  // TTFB — derived from the navigation entry.
  try {
    const nav = performance.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming | undefined;
    if (nav) {
      const ttfb = nav.responseStart - nav.startTime;
      if (Number.isFinite(ttfb) && ttfb >= 0) {
        reportMetric("TTFB", ttfb);
      }
    }
  } catch {
    /* unsupported */
  }

  // Flush LCP + CLS when the page is being backgrounded. iOS Safari
  // tends to skip a clean 'unload' — `visibilitychange` is the only
  // reliable signal.
  const flush = () => {
    if (document.visibilityState !== "hidden") return;
    if (lcpValue > 0) {
      reportMetric("LCP", lcpValue);
      lcpValue = 0; // single-shot
    }
    if (clsValue > 0) {
      reportMetric("CLS", clsValue);
      clsValue = 0;
    }
  };
  document.addEventListener("visibilitychange", flush);
  window.addEventListener("pagehide", flush);

  return () => {
    document.removeEventListener("visibilitychange", flush);
    window.removeEventListener("pagehide", flush);
    for (const o of observers) {
      try {
        o.disconnect();
      } catch {
        /* ignore */
      }
    }
  };
}
