"use client";

// Phase 226 — Settings control for the global text-scale.
//
// Three segmented buttons. Selection takes effect immediately —
// useTextScale writes to localStorage AND updates the live
// data-text-scale attribute on <html>. The card itself follows the
// scale change since it inherits the same root font-size.

import { Type } from "lucide-react";

import { useTextScale, type TextScale } from "@/lib/use-text-scale";
import { tap } from "@/lib/haptics";

const OPTIONS: Array<{ value: TextScale; label: string; sample: string }> = [
  { value: "compact", label: "קומפקטי", sample: "אא" },
  { value: "normal", label: "רגיל", sample: "אא" },
  { value: "large", label: "גדול", sample: "אא" },
];

const SAMPLE_SIZE: Record<TextScale, string> = {
  compact: "text-[14px]",
  normal: "text-[16px]",
  large: "text-[20px]",
};

export function TextSizeCard() {
  const { scale, setScale } = useTextScale();
  return (
    <section className="rounded-2xl border border-border/60 bg-surface/50 p-5 backdrop-blur-md">
      <div className="flex items-center gap-2 pb-3">
        <Type className="size-4 text-[color:var(--neon)]" />
        <span className="text-[13px] font-medium text-foreground">
          גודל טקסט
        </span>
      </div>
      <p className="pb-3 text-[12px] text-muted-foreground">
        בחר גודל קריא ונוח. שמירה אוטומטית — תקף לכל המסך מיד.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((opt) => {
          const active = scale === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                tap();
                setScale(opt.value);
              }}
              className={`tap-44 flex flex-col items-center justify-center gap-1 rounded-xl border px-3 py-3 transition-colors ${
                active
                  ? "border-[color:var(--neon)]/60 bg-[color:var(--neon)]/12 text-[color:var(--neon)]"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20 hover:text-foreground"
              }`}
              aria-pressed={active}
            >
              <span className={`${SAMPLE_SIZE[opt.value]} font-medium leading-none`}>
                {opt.sample}
              </span>
              <span className="text-[11px]">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
