"use client";

// Home v2 · Recent activity (4 rows).

import { LedgerRow, SectionHeader } from "./primitives";
import type { HomeActivityRow } from "./use-home-data";

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

export function RecentActivityLedger({
  rows,
  onRowTap,
}: {
  rows: HomeActivityRow[];
  onRowTap: (row: HomeActivityRow) => void;
}) {
  return (
    <section className="sally-section">
      <SectionHeader eyebrow="פעולות אחרונות" />
      {rows.length === 0 ? (
        <p className="sally-empty-line">אין פעולות שנרשמו החודש.</p>
      ) : (
        <ul className="sally-list">
          {rows.map((r) => (
            <li key={r.id}>
              <LedgerRow
                label={r.label}
                meta={r.metaLabel}
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
