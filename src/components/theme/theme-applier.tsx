"use client";

// Phase 334 — applies the user's chosen color scheme to <html>.
//
// Reads `theme` from the Zustand store ("dark" | "light" | "auto"). For
// "auto", subscribes to prefers-color-scheme so the app flips with the
// OS without a reload. For explicit "dark" / "light", that wins over
// the OS.
//
// Renders nothing; the side-effect is the .dark / .light class swap on
// the html element. The layout still ships .dark by default to avoid a
// flash before hydration.

import { useEffect } from "react";

import { useFinanceStore } from "@/lib/store";

function applyClass(next: "dark" | "light"): void {
  const root = document.documentElement;
  if (next === "dark") {
    root.classList.add("dark");
    root.classList.remove("light");
  } else {
    root.classList.add("light");
    root.classList.remove("dark");
  }
}

function resolveTheme(
  pref: "dark" | "light" | "auto",
  mq?: MediaQueryList,
): "dark" | "light" {
  if (pref === "dark" || pref === "light") return pref;
  if (typeof window === "undefined") return "dark";
  const media = mq ?? window.matchMedia("(prefers-color-scheme: dark)");
  return media.matches ? "dark" : "light";
}

export function ThemeApplier() {
  const hydrated = useFinanceStore((s) => s.hasHydrated);
  const theme = useFinanceStore((s) => s.theme);

  useEffect(() => {
    if (!hydrated) return;
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    applyClass(resolveTheme(theme, mq));
    if (theme !== "auto") return;
    const onChange = () => applyClass(resolveTheme(theme, mq));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [hydrated, theme]);

  return null;
}
