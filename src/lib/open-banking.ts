// Provider-agnostic Open Banking interface.
//
// Two real-world targets:
//   - Plaid (US/Global, robust SDK). Sandbox is free; production needs approval.
//   - Israel Open Banking (PSD2-style standard mandated by Bank of Israel).
//     No single SDK — each TPP integrates per-bank. Aggregators exist.
//
// Today, no implementation is wired in. The webhook route at
// /api/webhooks/transactions accepts a normalized `TransactionPayload`,
// so any provider just needs to translate its own payload to that shape.

import type { CategoryId } from "@/lib/categories";
import type { PaymentMethod } from "@/types/finance";

export type ProviderId = "plaid" | "il-open-banking" | "mock";

export type RawProviderTransaction = {
  externalId: string;
  amountMinorUnits: number;
  currency: string;
  occurredAt: string;
  merchantName?: string;
  rawCategoryHints?: string[];
  paymentMethod?: PaymentMethod;
  installments?: number;
};

export type NormalizedTransaction = {
  externalId: string;
  amount: number;
  currency: "ILS";
  paymentMethod: PaymentMethod;
  installments: number;
  category?: CategoryId;
  merchant?: string;
  note?: string;
  occurredAt: string;
};

export interface OpenBankingProvider {
  id: ProviderId;
  name: string;
  /**
   * Convert a provider-specific transaction shape to the canonical shape
   * we send through the webhook -> store pipeline.
   */
  normalize(raw: RawProviderTransaction): NormalizedTransaction;
  /**
   * Returns a Link/Connect URL the user navigates to in order to grant
   * read-only access to their account. Implementation will exchange a
   * temporary code for a long-lived access token, stored encrypted.
   */
  getLinkUrl(args: { userId: string; redirectUrl: string }): Promise<string>;
}

function categoryFromHints(hints: string[] | undefined): CategoryId | undefined {
  if (!hints || hints.length === 0) return undefined;
  const text = hints.join(" ").toLowerCase();
  if (/(food|restaurant|grocer|supermarket|coffee|אוכל|מסעד|סופר)/.test(text))
    return "food";
  if (/(transport|gas|fuel|taxi|תחבורה|דלק|מונית)/.test(text)) return "transport";
  if (/(shop|retail|amazon|קני|חנות)/.test(text)) return "shopping";
  if (/(entertainment|cinema|netflix|spotify|בילו|סרט)/.test(text))
    return "entertainment";
  if (/(electric|water|gas|internet|חשמל|מים|אינטרנט|תקשורת|חשבון)/.test(text))
    return "bills";
  if (/(health|pharm|medical|בריאות|קופ"ח|רוקח)/.test(text)) return "health";
  if (/(school|education|חינוך|לימוד|בית ספר|גן)/.test(text)) return "education";
  if (/(gift|מתנה|מתנות)/.test(text)) return "gifts";
  return undefined;
}

// Mock provider — used for documentation, tests, and local sandbox flows.
// A real provider implementation lives in `src/lib/providers/<name>.ts` and
// is selected by `OPEN_BANKING_PROVIDER` env at runtime.
export const mockProvider: OpenBankingProvider = {
  id: "mock",
  name: "Mock Provider",
  normalize(raw) {
    if (raw.currency.toUpperCase() !== "ILS") {
      throw new Error(`Unsupported currency: ${raw.currency}`);
    }
    return {
      externalId: raw.externalId,
      amount: raw.amountMinorUnits / 100,
      currency: "ILS",
      paymentMethod: raw.paymentMethod ?? "credit",
      installments: Math.max(1, raw.installments ?? 1),
      category: categoryFromHints(raw.rawCategoryHints),
      merchant: raw.merchantName,
      occurredAt: raw.occurredAt,
    };
  },
  async getLinkUrl() {
    throw new Error(
      "Mock provider has no link flow. Implement a real provider in src/lib/providers/.",
    );
  },
};

export function getProvider(): OpenBankingProvider {
  // When a real implementation lands, swap on env:
  //   const id = (process.env.OPEN_BANKING_PROVIDER as ProviderId) ?? "mock";
  //   if (id === "plaid") return plaidProvider;
  //   if (id === "il-open-banking") return ilProvider;
  return mockProvider;
}
