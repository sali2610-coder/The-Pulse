"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Copy } from "lucide-react";
import { tap } from "@/lib/haptics";

type Props = {
  value: string;
  label?: string;
  /** When true, renders the value as a wide multi-line block (e.g. JSON). */
  block?: boolean;
};

/**
 * Compact "value + copy" affordance. Used across the setup cheatsheet so
 * every Shortcut field has a tactile single-tap copy.
 */
export function CopyChip({ value, label, block }: Props) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      tap();
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — silently fall through */
    }
  };

  if (block) {
    return (
      <div className="space-y-1.5">
        {label ? (
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            <span>{label}</span>
            <CopyButton onCopy={onCopy} copied={copied} />
          </div>
        ) : null}
        <pre
          data-mono="true"
          className="overflow-x-auto rounded-lg border border-white/5 bg-black/40 px-3 py-2.5 text-[12px] text-foreground"
          style={{ direction: "ltr" }}
        >
          {value}
        </pre>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/30 px-3 py-2">
      <div className="min-w-0 flex-1">
        {label ? (
          <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            {label}
          </div>
        ) : null}
        <div
          data-mono="true"
          className="truncate text-[12px] text-foreground"
          style={{ direction: "ltr", textAlign: "left" }}
          title={value}
        >
          {value}
        </div>
      </div>
      <CopyButton onCopy={onCopy} copied={copied} />
    </div>
  );
}

function CopyButton({
  onCopy,
  copied,
}: {
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onCopy}
      className="flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
      aria-label="העתק"
    >
      <AnimatePresence mode="wait" initial={false}>
        {copied ? (
          <motion.span
            key="ok"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex items-center gap-1 text-gold"
          >
            <Check className="size-3" /> הועתק
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1"
          >
            <Copy className="size-3" /> העתק
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
