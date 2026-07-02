"use client";

// Home v2 · Insight whisper (one line, ghost link).

import { Eyebrow } from "./primitives";
import type { HomeInsightWhisper } from "./use-home-data";

export function InsightWhisper({
  insight,
  onOpen,
}: {
  insight: HomeInsightWhisper;
  onOpen: () => void;
}) {
  return (
    <section className="sally-section sally-insight-section">
      <Eyebrow accent>תובנה</Eyebrow>
      <p className="sally-insight-body">{insight.body}</p>
      <button
        type="button"
        onClick={onOpen}
        className="sally-insight-cta"
        aria-label="פתח את כל התובנות"
      >
        ראה את כל התובנות ←
      </button>
    </section>
  );
}
