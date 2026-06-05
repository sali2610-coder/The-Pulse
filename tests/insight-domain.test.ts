// Phase 383 — insight-domain mapping contract.

import { describe, expect, it } from "vitest";

import { bucketByDomain, domainOf } from "@/lib/insight-domain";
import type { AiInsight } from "@/lib/ai-insights";

function ins(o: Partial<AiInsight>): AiInsight {
  return {
    id: o.id ?? "i-1",
    group: o.group ?? "trend",
    severity: o.severity ?? 1,
    urgency: o.urgency ?? 1,
    confidence: o.confidence ?? 0.7,
    title: o.title ?? "",
    body: o.body ?? "",
    priority: o.priority ?? 5,
    ...o,
  };
}

describe("domainOf", () => {
  it("opportunity → opportunities", () => {
    expect(domainOf(ins({ group: "opportunity" }))).toBe("opportunities");
  });

  it("risk → risks", () => {
    expect(domainOf(ins({ group: "risk" }))).toBe("risks");
  });

  it("salary keyword → income", () => {
    expect(domainOf(ins({ group: "trend", title: "משכורת עלתה" }))).toBe(
      "income",
    );
  });

  it("card keyword → cards", () => {
    expect(domainOf(ins({ group: "trend", title: "אשראי גבוה" }))).toBe(
      "cards",
    );
  });

  it("loan / rule keyword → commitments", () => {
    expect(domainOf(ins({ group: "trend", title: "הלוואה מסתיימת" }))).toBe(
      "commitments",
    );
    expect(domainOf(ins({ group: "trend", id: "rule-drift:r-1" }))).toBe(
      "commitments",
    );
  });

  it("fallback → cashflow", () => {
    expect(domainOf(ins({ group: "prediction", title: "תזרים חיובי" }))).toBe(
      "cashflow",
    );
  });
});

describe("bucketByDomain", () => {
  it("groups insights into 6 ordered domains and surfaces topSeverity", () => {
    const buckets = bucketByDomain([
      ins({ id: "a", group: "risk", severity: 3, title: "סיכון" }),
      ins({ id: "b", group: "opportunity", severity: 1, title: "חיסכון" }),
      ins({ id: "c", group: "trend", title: "אשראי" }),
    ]);
    expect(buckets.map((b) => b.domain)).toEqual([
      "risks",
      "opportunities",
      "cashflow",
      "cards",
      "commitments",
      "income",
    ]);
    const risks = buckets.find((b) => b.domain === "risks")!;
    expect(risks.insights).toHaveLength(1);
    expect(risks.topSeverity).toBe(3);
  });
});
