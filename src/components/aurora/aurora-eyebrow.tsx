"use client";

// Phase 432 · AURORA v1 — Eyebrow
//
// 11pt tracked label. Decorative — never the only label for a
// section. Pair every Eyebrow with sr-only <h2>/<h3>/etc. so the
// section has a real heading for screen readers.
//
// Per HIG critique: no uppercase (Hebrew has no case; weight 600
// + +14% tracking carries the rhythm in both scripts).

import { type ReactNode } from "react";

export type EyebrowProps = {
  children: ReactNode;
  /** Renders an sr-only heading at the configured level so the
   *  semantic outline stays intact even when the eyebrow itself
   *  is decorative.
   */
  srHeading?: {
    level: 1 | 2 | 3 | 4 | 5 | 6;
    text: string;
  };
};

export function Eyebrow({ children, srHeading }: EyebrowProps) {
  const Heading = (`h${srHeading?.level ?? 2}` as unknown) as keyof React.JSX.IntrinsicElements;
  return (
    <>
      {srHeading ? <Heading className="sr-only">{srHeading.text}</Heading> : null}
      <span aria-hidden className="aurora-eyebrow">
        {children}
      </span>
    </>
  );
}
