"use client";

import { motion } from "framer-motion";
import { Volume2, VolumeX, Play } from "lucide-react";
import { useFinanceStore } from "@/lib/store";
import { playSyncChime } from "@/lib/chime";
import { tap } from "@/lib/haptics";

export function AudioToggle() {
  const enabled = useFinanceStore((s) => s.audioEnabled);
  const setEnabled = useFinanceStore((s) => s.setAudioEnabled);

  return (
    <section className="rounded-2xl border border-border/60 bg-surface/50 p-5 backdrop-blur-md">
      <header className="mb-4 flex items-center gap-2">
        {enabled ? (
          <Volume2 className="size-4 text-neon" />
        ) : (
          <VolumeX className="size-4 text-muted-foreground" />
        )}
        <div>
          <div className="text-sm font-medium text-foreground">צליל סנכרון</div>
          <div className="text-[11px] text-muted-foreground">
            צליל קצר נשמע כשעסקה חדשה נכנסת מסנכרון
          </div>
        </div>
      </header>

      <div className="flex items-center justify-between gap-3">
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={() => {
            tap();
            setEnabled(!enabled);
          }}
          className={`relative flex h-9 w-16 items-center rounded-full border transition-colors ${
            enabled
              ? "border-neon/50 bg-neon/15"
              : "border-border/60 bg-background/40"
          }`}
          aria-pressed={enabled}
          aria-label={enabled ? "כבה צליל" : "הפעל צליל"}
        >
          <motion.span
            layout
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className={`block h-7 w-7 rounded-full ${
              enabled ? "ms-auto me-1 bg-neon" : "ms-1 bg-muted"
            }`}
          />
        </motion.button>

        <button
          type="button"
          onClick={() => {
            void playSyncChime();
          }}
          disabled={!enabled}
          className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-neon/50 hover:text-foreground disabled:opacity-30"
        >
          <Play className="size-3.5" />
          השמע
        </button>
      </div>
    </section>
  );
}
