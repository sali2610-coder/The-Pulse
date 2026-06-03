"use client";

import { forwardRef, useState } from "react";

import { parseCurrencyAmount } from "@/lib/money";

type Props = {
  value: number | undefined;
  onChange: (next: number | undefined) => void;
  onBlur?: () => void;
  hasError?: boolean;
};

export const AmountInput = forwardRef<HTMLInputElement, Props>(
  function AmountInput({ value, onChange, onBlur, hasError }, ref) {
    // Phase 341 — local text buffer so the user can type "59.", "59.9"
    // and "59.90" without the controlled value collapsing the trailing
    // zeros or stripping the dot mid-type. The committed numeric value
    // still flows up through `onChange` after each keystroke.
    const [text, setText] = useState<string>(() =>
      value === undefined || Number.isNaN(value) ? "" : String(value),
    );

    return (
      <div
        className={`relative flex items-center justify-center rounded-2xl border bg-surface/60 px-6 py-7 transition-all ${
          hasError
            ? "border-destructive/60"
            : "border-border/60 focus-within:glow-neon focus-within:border-neon/60"
        }`}
      >
        <span
          data-mono="true"
          className="me-3 text-3xl text-muted-foreground"
          style={{ direction: "ltr" }}
        >
          ₪
        </span>
        <input
          ref={ref}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          dir="ltr"
          placeholder="0"
          value={text}
          onChange={(e) => {
            // Normalize: drop anything other than digits and one dot;
            // cap at 2 fraction digits so the field can't represent
            // partial agorot.
            let raw = e.target.value.replace(/[^\d.]/g, "");
            const firstDot = raw.indexOf(".");
            if (firstDot !== -1) {
              const head = raw.slice(0, firstDot);
              const tail = raw.slice(firstDot + 1).replace(/\./g, "").slice(0, 2);
              raw = `${head}.${tail}`;
            }
            setText(raw);
            onChange(raw === "" ? undefined : parseCurrencyAmount(raw));
          }}
          onBlur={(e) => {
            // On blur, snap the displayed text to the canonical
            // representation (drops trailing dot like "59." → "59").
            const parsed = parseCurrencyAmount(text);
            setText(parsed === undefined ? "" : String(parsed));
            onBlur?.();
            void e;
          }}
          data-mono="true"
          className="w-full bg-transparent text-center text-6xl font-light tracking-tight text-foreground outline-none placeholder:text-muted-foreground/40 sm:text-7xl"
          aria-label="סכום ההוצאה בשקלים"
        />
      </div>
    );
  },
);
