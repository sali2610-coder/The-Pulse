import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "neon" | "gold" | "green" | "red" | "purple";

type Props = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
  icon?: React.ReactNode;
};

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-white/8 text-foreground/80",
  neon: "bg-[color:var(--neon)]/14 text-[color:var(--neon)]",
  gold: "bg-gold/15 text-gold",
  green: "bg-[#34D399]/15 text-[#34D399]",
  red: "bg-destructive/15 text-destructive",
  purple: "bg-[#A78BFA]/15 text-[#A78BFA]",
};

/**
 * Tiny chip for source / state / category badges. Reads as part of a
 * single typographic line; no border, just tinted background + tinted
 * text so the surrounding card stays the dominant visual element.
 */
export function Pill({
  tone = "neutral",
  icon,
  className,
  children,
  ...rest
}: Props) {
  return (
    <span
      {...rest}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-none",
        TONE_CLASS[tone],
        className,
      )}
    >
      {icon ? <span className="inline-flex">{icon}</span> : null}
      {children}
    </span>
  );
}
