// Phase 383 — six AI Command Center domains.
//
// Re-categorizes existing AiInsight records into the six folders the
// product brief calls for, without touching the engine:
//
//   💰 cashflow      → תזרים מזומנים
//   📈 income        → הכנסות ומשכורות
//   💳 cards         → כרטיסי אשראי
//   🏦 commitments   → חיובים קבועים והלוואות
//   ⚠️ risks         → סיכונים והתראות
//   🎯 opportunities → הזדמנויות לחיסכון
//
// Mapping rules (matched in order):
//   1. Engine group "opportunity" → opportunities
//   2. Engine group "risk" → risks
//   3. Insight id / title mentions "salary" / "income" → income
//   4. Insight id / title mentions "card" / "credit" → cards
//   5. Insight id / title mentions "rule" / "loan" / "subscription" /
//      "recurring" → commitments
//   6. Engine group "prediction" or "trend" + cashflow-related →
//      cashflow
//   7. Fallback → cashflow

import type { AiInsight, AiInsightGroup } from "@/lib/ai-insights";

export type InsightDomain =
  | "cashflow"
  | "income"
  | "cards"
  | "commitments"
  | "risks"
  | "opportunities";

export const DOMAIN_ORDER: InsightDomain[] = [
  "risks",
  "opportunities",
  "cashflow",
  "cards",
  "commitments",
  "income",
];

export const DOMAIN_LABEL: Record<InsightDomain, string> = {
  cashflow: "תזרים מזומנים",
  income: "הכנסות ומשכורות",
  cards: "כרטיסי אשראי",
  commitments: "חיובים קבועים והלוואות",
  risks: "סיכונים והתראות",
  opportunities: "הזדמנויות לחיסכון",
};

export const DOMAIN_EMOJI: Record<InsightDomain, string> = {
  cashflow: "💰",
  income: "📈",
  cards: "💳",
  commitments: "🏦",
  risks: "⚠️",
  opportunities: "🎯",
};

export const DOMAIN_TONE: Record<InsightDomain, string> = {
  cashflow: "#22D3EE",
  income: "#34D399",
  cards: "#75F5FF",
  commitments: "#A78BFA",
  risks: "#F87171",
  opportunities: "#FBBF24",
};

const SALARY_HINT = /salary|income|salar|salaryDelta|משכור|הכנס/i;
const CARD_HINT = /card|credit|אשר|אשראי|כרטיס/i;
const COMMIT_HINT =
  /rule|loan|subscription|recurring|installment|הלוואה|מנוי|הוצא.*קבוע|תשלום/i;

export function domainOf(insight: AiInsight): InsightDomain {
  const group: AiInsightGroup = insight.group;
  if (group === "opportunity") return "opportunities";
  if (group === "risk") return "risks";
  const hayId = insight.id ?? "";
  const hayTitle = insight.title ?? "";
  const hayBody = insight.body ?? "";
  const text = `${hayId} ${hayTitle} ${hayBody}`;
  if (SALARY_HINT.test(text)) return "income";
  if (CARD_HINT.test(text)) return "cards";
  if (COMMIT_HINT.test(text)) return "commitments";
  return "cashflow";
}

export type DomainBucket = {
  domain: InsightDomain;
  insights: AiInsight[];
  /** Highest severity in the bucket — drives the priority dot. */
  topSeverity: 1 | 2 | 3 | 0;
};

export function bucketByDomain(insights: AiInsight[]): DomainBucket[] {
  const map = new Map<InsightDomain, AiInsight[]>();
  for (const d of DOMAIN_ORDER) map.set(d, []);
  for (const i of insights) {
    map.get(domainOf(i))!.push(i);
  }
  return DOMAIN_ORDER.map((domain) => {
    const arr = map.get(domain) ?? [];
    let topSeverity: 1 | 2 | 3 | 0 = 0;
    for (const i of arr) {
      if (i.severity > topSeverity) topSeverity = i.severity;
    }
    return { domain, insights: arr, topSeverity };
  });
}
