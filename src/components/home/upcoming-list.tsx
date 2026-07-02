"use client";

// Home v2 · Upcoming list (14 days).

import { LedgerRow, SectionHeader } from "./primitives";
import type { HomeUpcomingRow } from "./use-home-data";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export function UpcomingList({
  rows,
  onRowTap,
}: {
  rows: HomeUpcomingRow[];
  onRowTap: (row: HomeUpcomingRow) => void;
}) {
  return (
    <section className="sally-section">
      <SectionHeader eyebrow="מה מתקרב" />
      {rows.length === 0 ? (
        <p className="sally-empty-line">אין אירועים מתוכננים בשבועיים הקרובים.</p>
      ) : (
        <ul className="sally-list">
          {rows.map((r) => (
            <li key={r.id}>
              <LedgerRow
                label={r.label}
                meta={r.daysLabel}
                amount={
                  <>
                    {r.direction === "in" ? "+" : "−"}
                    {ILS.format(r.amount)}
                  </>
                }
                amountTone={r.direction === "in" ? "safe" : "ink"}
                onClick={() => onRowTap(r)}
                ariaLabel={`פרטי ${r.label}`}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
