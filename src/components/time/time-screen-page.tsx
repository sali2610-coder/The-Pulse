"use client";

// Phase 358 — page-shell wrapper for the standalone /time route.
//
// AppShell handles auth + tabs for the SPA flow. The deep-link route
// renders a slimmer shell: brand chrome on top, back-to-app affordance,
// and the TimeScreen below.

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { TimeScreen } from "@/components/time/time-screen";

export function TimeScreenPage() {
  return (
    <main
      className="relative flex min-h-dvh flex-col gap-4 px-5 pb-10"
      style={{ paddingTop: "max(env(safe-area-inset-top), 1.25rem)" }}
      dir="rtl"
    >
      <header className="mx-auto flex w-full max-w-md items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-black/30 px-3 py-1.5 text-[12px] text-foreground/85 hover:border-white/16"
          aria-label="חזרה לבית"
        >
          <ArrowRight className="size-3.5" aria-hidden />
          בית
        </Link>
        <span className="text-[10px] uppercase tracking-[0.3em] text-gold/80">
          זמן
        </span>
      </header>
      <div className="mx-auto w-full max-w-md">
        <TimeScreen />
      </div>
    </main>
  );
}
