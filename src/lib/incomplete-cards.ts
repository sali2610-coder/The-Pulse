// Detector for active credit cards that haven't filled out the
// Phase 90 metadata (billingDay + paymentDay). These are the cards
// where every downstream feature degrades:
//   • Cycle projection (Phase 100) returns undefined.
//   • Upcoming-debit banner (Phase 107) silently skips them.
//   • Utilization fallback (Phase 101) can't use cycle when debt
//     isn't tracked either.
//
// Pure compute. Tells the UI which cards are incomplete and what
// piece is missing.

import type { Account } from "@/types/finance";

export type IncompleteCard = {
  accountId: string;
  label: string;
  missingBillingDay: boolean;
  missingPaymentDay: boolean;
};

export function detectIncompleteCards(args: {
  accounts: Account[];
}): IncompleteCard[] {
  const out: IncompleteCard[] = [];
  for (const a of args.accounts) {
    if (!a.active) continue;
    if (a.kind !== "card") continue;
    const missingBillingDay = !a.billingDay;
    const missingPaymentDay = !a.paymentDay;
    if (!missingBillingDay && !missingPaymentDay) continue;
    out.push({
      accountId: a.id,
      label: a.label,
      missingBillingDay,
      missingPaymentDay,
    });
  }
  return out;
}
