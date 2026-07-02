"use client";

// Home v2 · Category list (top 4).

import { SectionHeader } from "./primitives";
import type { HomeCategoryRow } from "./use-home-data";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export function CategoryList({
  rows,
  onOpen,
}: {
  rows: HomeCategoryRow[];
  onOpen: () => void;
}) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <section className="sally-section">
      <SectionHeader
        eyebrow="לאן הולך הכסף"
        end={
          total > 0 ? (
            <span dir="ltr" className="sally-section-end-amount">
              {ILS.format(total)}
            </span>
          ) : null
        }
      />
      {rows.length === 0 ? (
        <p className="sally-empty-line">עוד אין הוצאות בחודש הזה.</p>
      ) : (
        <ul className="sally-cat-list">
          {rows.map((r) => {
            const delta = r.deltaPct;
            const tone =
              delta === null
                ? "neutral"
                : delta >= 25
                  ? "watch"
                  : delta <= -15
                    ? "safe"
                    : "neutral";
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={onOpen}
                  aria-label={`פתח קטגוריה ${r.label}`}
                  className="sally-cat-row"
                >
                  <span
                    aria-hidden
                    className="sally-cat-dot"
                    style={{ background: r.color }}
                  />
                  <span className="sally-cat-label">{r.label}</span>
                  <span dir="ltr" className="sally-cat-amount">
                    {ILS.format(r.amount)}
                  </span>
                  <span
                    dir="ltr"
                    className="sally-cat-delta"
                    data-aurora-tone={tone}
                  >
                    {delta === null
                      ? "—"
                      : `${delta >= 0 ? "↑" : "↓"} ${Math.abs(Math.round(delta))}%`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
