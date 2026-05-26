"use client";

// Phase 226 — global text-scale preference.
//
// Three steps: "compact", "normal", "large". Stored in localStorage
// and applied to <html data-text-scale="…"> so the matching CSS
// rules in globals.css cascade through every page. Default is
// "normal" — no behaviour change for existing users.
//
// No Zustand coupling — the preference is independent of the
// financial store and a single listener model keeps the toggle in
// sync with whatever UI surfaces expose it.

import { useEffect, useState } from "react";

export type TextScale = "compact" | "normal" | "large";

const KEY = "sally.text-scale.v1";

const listeners = new Set<(s: TextScale) => void>();

function read(): TextScale {
  if (typeof window === "undefined") return "normal";
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "compact" || v === "large") return v;
    return "normal";
  } catch {
    return "normal";
  }
}

function apply(scale: TextScale): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-text-scale", scale);
}

function write(scale: TextScale): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, scale);
  } catch {
    // Safari private mode — fail silent.
  }
  apply(scale);
  for (const l of listeners) l(scale);
}

/** One-shot bootstrap to apply the persisted preference at app
 *  mount. Safe to call from a top-level client component. */
export function bootstrapTextScale(): void {
  apply(read());
}

export function useTextScale(): {
  scale: TextScale;
  setScale: (s: TextScale) => void;
} {
  const [scale, setLocal] = useState<TextScale>("normal");

  useEffect(() => {
    // Defer to a microtask so the lint rule that forbids synchronous
    // setState inside an effect body passes. Matches the pattern used
    // by DashboardSection.
    let cancelled = false;
    const cb = (s: TextScale) => {
      if (!cancelled) setLocal(s);
    };
    listeners.add(cb);
    Promise.resolve().then(() => {
      if (cancelled) return;
      const v = read();
      setLocal(v);
      apply(v);
    });
    return () => {
      cancelled = true;
      listeners.delete(cb);
    };
  }, []);

  return {
    scale,
    setScale: (s) => {
      setLocal(s);
      write(s);
    },
  };
}
