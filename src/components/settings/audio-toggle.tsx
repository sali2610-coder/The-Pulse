"use client";

import { Volume2, VolumeX, Play } from "lucide-react";
import { useFinanceStore } from "@/lib/store";
import { playSyncChime } from "@/lib/chime";
import { BigSwitch } from "@/components/ui/big-switch";

export function AudioToggle() {
  const enabled = useFinanceStore((s) => s.audioEnabled);
  const setEnabled = useFinanceStore((s) => s.setAudioEnabled);

  return (
    <section className="rounded-2xl border border-border/60 bg-surface/50 p-5 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {enabled ? (
            <Volume2 className="size-4 text-neon" />
          ) : (
            <VolumeX className="size-4 text-muted-foreground" />
          )}
          <div className="flex flex-col leading-tight">
            <span className="text-section text-foreground">צליל סנכרון</span>
            <span className="text-caption text-muted-foreground/80">
              צליל קצר כשעסקה חדשה נכנסת
            </span>
          </div>
        </div>
        <BigSwitch
          on={enabled}
          onChange={setEnabled}
          label={enabled ? "כבה צליל" : "הפעל צליל"}
        />
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => {
            void playSyncChime();
          }}
          disabled={!enabled}
          className="tap-44 text-body flex items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-4 py-2 text-muted-foreground transition-colors hover:border-neon/50 hover:text-foreground disabled:opacity-30"
        >
          <Play className="size-3.5" />
          השמע
        </button>
      </div>
    </section>
  );
}
