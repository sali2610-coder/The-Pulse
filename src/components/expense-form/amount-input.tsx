"use client";

import { forwardRef } from "react";

type Props = {
  value: number | undefined;
  onChange: (next: number | undefined) => void;
  onBlur?: () => void;
  hasError?: boolean;
};

export const AmountInput = forwardRef<HTMLInputElement, Props>(
  function AmountInput({ value, onChange, onBlur, hasError }, ref) {
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
          value={value === undefined || Number.isNaN(value) ? "" : String(value)}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d.]/g, "");
            if (raw === "") return onChange(undefined);
            const num = Number(raw);
            onChange(Number.isFinite(num) ? num : undefined);
          }}
          onBlur={onBlur}
          data-mono="true"
          className="w-full bg-transparent text-center text-6xl font-light tracking-tight text-foreground outline-none placeholder:text-muted-foreground/40 sm:text-7xl"
          aria-label="סכום ההוצאה בשקלים"
        />
      </div>
    );
  },
);
