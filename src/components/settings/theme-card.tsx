"use client";

// Phase 334 — color-scheme switch.
//
// Sits under TextSizeCard. Three segments (לילה / יום / אוטומטי)
// driven by the Zustand store; ThemeApplier handles the actual class
// swap and OS-preference subscription.

import { motion } from "framer-motion";
import { Moon, Palette, Sun, SunMoon } from "lucide-react";

import { useFinanceStore } from "@/lib/store";
import { tap } from "@/lib/haptics";

type ThemeId = "dark" | "light" | "auto";

const OPTIONS: Array<{ id: ThemeId; label: string; icon: React.ReactNode }> = [
  { id: "dark", label: "לילה", icon: <Moon className="size-3.5" /> },
  { id: "light", label: "יום", icon: <Sun className="size-3.5" /> },
  { id: "auto", label: "אוטומטי", icon: <SunMoon className="size-3.5" /> },
];

export function ThemeCard() {
  const theme = useFinanceStore((s) => s.theme);
  const setTheme = useFinanceStore((s) => s.setTheme);

  return (
    <section className="glass-card flex flex-col gap-3 rounded-2xl p-4">
      <header className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-xl bg-[color:var(--neon)]/15 text-[color:var(--neon)]">
          <Palette className="size-4" />
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-section text-foreground">מצב תצוגה</span>
          <span className="text-caption text-muted-foreground">
            בחר את שפת הצבעים — אוטומטי עוקב אחרי המכשיר
          </span>
        </div>
      </header>

      <div
        role="radiogroup"
        aria-label="מצב תצוגה"
        className="relative flex rounded-full border border-white/10 bg-black/20 p-1 dark:bg-black/30"
      >
        {OPTIONS.map((opt) => {
          const active = theme === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                tap();
                setTheme(opt.id);
              }}
              className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon)]/60 ${
                active
                  ? "text-[color:var(--neon)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {active ? (
                <motion.span
                  layoutId="theme-pill"
                  className="absolute inset-0 -z-10 rounded-full bg-[color:var(--neon)]/15 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--neon)_50%,transparent)]"
                  transition={{ type: "spring", stiffness: 260, damping: 24 }}
                />
              ) : null}
              {opt.icon}
              {opt.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
