// Phase 265 — flatten card breakdown into per-(card × month)
// folders so the UI never renders one merged card container.

import { describe, expect, it } from "vitest";

import { buildCardMonthFolders } from "@/lib/card-month-folders";
import type {
  CardBreakdownReport,
  CategoryGroup,
} from "@/lib/card-category-breakdown";

const NOW = new Date(2026, 5, 4, 12, 0, 0); // 2026-06-04

function group(o: {
  category: CategoryGroup["category"];
  items: Array<{
    label: string;
    amount: number;
    iso: string;
    kind: CategoryGroup["items"][number]["kind"];
    refId?: string;
  }>;
}): CategoryGroup {
  let total = 0;
  let recurring = 0;
  let installments = 0;
  let oneTime = 0;
  const items = o.items.map((it, i) => {
    total += it.amount;
    if (it.kind === "recurring") recurring += it.amount;
    else if (it.kind === "installments") installments += it.amount;
    else oneTime += it.amount;
    return {
      label: it.label,
      amount: it.amount,
      effectiveCashAt: `${it.iso}T12:00:00.000Z`,
      kind: it.kind,
      refId: it.refId ?? `entry:e${i}:0`,
    };
  });
  return {
    category: o.category,
    total,
    recurring,
    installments,
    oneTime,
    items,
  };
}

describe("buildCardMonthFolders", () => {
  it("produces one folder per (card, month) — no merged container", () => {
    const report: CardBreakdownReport = {
      cards: [
        {
          cardId: "c-hitech",
          cardLabel: "Hitechzon",
          cardLast4: "1234",
          total: 7934,
          recurringTotal: 0,
          installmentsTotal: 0,
          oneTimeTotal: 7934,
          nextSettlementAt: null,
          categories: [
            group({
              category: "shopping",
              items: [
                { label: "Jun row", amount: 7617, iso: "2026-06-10", kind: "oneTime" },
                { label: "Jul row", amount: 317, iso: "2026-07-10", kind: "oneTime" },
              ],
            }),
          ],
        },
        {
          cardId: "c-ashm",
          cardLabel: "Ashmoret",
          cardLast4: "5678",
          total: 6000,
          recurringTotal: 6000,
          installmentsTotal: 0,
          oneTimeTotal: 0,
          nextSettlementAt: null,
          categories: [
            group({
              category: "bills",
              items: [
                { label: "Jun ins", amount: 3000, iso: "2026-06-14", kind: "recurring" },
                { label: "Jul ins", amount: 3000, iso: "2026-07-14", kind: "recurring" },
              ],
            }),
          ],
        },
      ],
      totalCommitted: 13934,
    };
    const folders = buildCardMonthFolders(report, NOW);
    // Expect: 2 cards × 2 months = 4 folders, never merged.
    expect(folders).toHaveLength(4);
    const labels = folders.map((f) => f.folderLabel);
    expect(labels).toContain("Hitechzon — יוני");
    expect(labels).toContain("Hitechzon — יולי");
    expect(labels).toContain("Ashmoret — יוני");
    expect(labels).toContain("Ashmoret — יולי");
  });

  it("subtotals each folder independently — no cross-month bleed", () => {
    const report: CardBreakdownReport = {
      cards: [
        {
          cardId: "c-hitech",
          cardLabel: "Hitechzon",
          total: 7934,
          recurringTotal: 0,
          installmentsTotal: 0,
          oneTimeTotal: 7934,
          nextSettlementAt: null,
          categories: [
            group({
              category: "shopping",
              items: [
                { label: "Jun", amount: 7617, iso: "2026-06-10", kind: "oneTime" },
                { label: "Jul", amount: 317, iso: "2026-07-10", kind: "oneTime" },
              ],
            }),
          ],
        },
      ],
      totalCommitted: 7934,
    };
    const folders = buildCardMonthFolders(report, NOW);
    const jun = folders.find((f) => f.monthKey === "2026-06");
    const jul = folders.find((f) => f.monthKey === "2026-07");
    expect(jun?.subtotal).toBe(7617);
    expect(jul?.subtotal).toBe(317);
  });

  it("labels current/next/future tiers correctly", () => {
    const report: CardBreakdownReport = {
      cards: [
        {
          cardId: "c1",
          cardLabel: "X",
          total: 3,
          recurringTotal: 3,
          installmentsTotal: 0,
          oneTimeTotal: 0,
          nextSettlementAt: null,
          categories: [
            group({
              category: "bills",
              items: [
                { label: "now", amount: 1, iso: "2026-06-10", kind: "recurring" },
                { label: "next", amount: 1, iso: "2026-07-10", kind: "recurring" },
                { label: "far", amount: 1, iso: "2026-08-10", kind: "recurring" },
              ],
            }),
          ],
        },
      ],
      totalCommitted: 3,
    };
    const folders = buildCardMonthFolders(report, NOW);
    expect(folders[0].kind).toBe("current");
    expect(folders[1].kind).toBe("next");
    expect(folders[2].kind).toBe("future");
  });

  it("preserves kind splits within each folder", () => {
    const report: CardBreakdownReport = {
      cards: [
        {
          cardId: "c1",
          cardLabel: "X",
          total: 600,
          recurringTotal: 100,
          installmentsTotal: 200,
          oneTimeTotal: 300,
          nextSettlementAt: null,
          categories: [
            group({
              category: "shopping",
              items: [
                { label: "r", amount: 100, iso: "2026-06-10", kind: "recurring" },
                { label: "i", amount: 200, iso: "2026-06-12", kind: "installments" },
                { label: "o", amount: 300, iso: "2026-06-14", kind: "oneTime" },
              ],
            }),
          ],
        },
      ],
      totalCommitted: 600,
    };
    const folders = buildCardMonthFolders(report, NOW);
    expect(folders).toHaveLength(1);
    expect(folders[0].recurringTotal).toBe(100);
    expect(folders[0].installmentsTotal).toBe(200);
    expect(folders[0].oneTimeTotal).toBe(300);
    expect(folders[0].subtotal).toBe(600);
  });

  it("returns empty array when no items exist", () => {
    const report: CardBreakdownReport = {
      cards: [],
      totalCommitted: 0,
    };
    expect(buildCardMonthFolders(report, NOW)).toEqual([]);
  });
});
