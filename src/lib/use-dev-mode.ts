"use client";

// Phase 231 — Developer-mode flag.
//
// Hides technical diagnostics (cloud-sync internals, integration
// device IDs, push-diag logs) from the default Settings view so
// non-technical users see a calm consumer surface. Power users
// flip the switch from a hidden corner of Settings.
//
// localStorage-backed singleton, same shape as use-text-scale.

import { useEffect, useState } from "react";

const KEY = "sally.dev-mode.v1";

const listeners = new Set<(on: boolean) => void>();

function read(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function write(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // Safari private mode — fail silent.
  }
  for (const l of listeners) l(on);
}

export function useDevMode(): {
  on: boolean;
  setOn: (v: boolean) => void;
  toggle: () => void;
} {
  const [on, setLocal] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    const cb = (v: boolean) => {
      if (!cancelled) setLocal(v);
    };
    listeners.add(cb);
    Promise.resolve().then(() => {
      if (!cancelled) setLocal(read());
    });
    return () => {
      cancelled = true;
      listeners.delete(cb);
    };
  }, []);

  return {
    on,
    setOn: (v) => {
      setLocal(v);
      write(v);
    },
    toggle: () => {
      const next = !on;
      setLocal(next);
      write(next);
    },
  };
}
