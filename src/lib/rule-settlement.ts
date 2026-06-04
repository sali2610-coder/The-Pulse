// Phase 354 — canonical "is this recurring rule settled via a credit
// card?" resolver.
//
// A rule lands in the credit lane when EITHER:
//   - the user explicitly set paymentSource === "card", OR
//   - the user picked a linkedCardId (the legacy "פטור משדה רדיו"
//     flow that ran before the paymentSource enum was finalised left
//     many rules with paymentSource: "unknown" + linkedCardId set,
//     and those need to behave like card-routed rules everywhere).
//
// Pure compute. Used by financial-snapshot, forecast, CFO breakdown,
// and any other surface that has to ask "should this go through the
// bank-fixed lane or the card-billing lane?".

import type { RecurringRule } from "@/types/finance";

export function isRuleCardSettled(rule: RecurringRule): boolean {
  if (rule.paymentSource === "card") return true;
  // Legacy fallback: linkedCardId set, paymentSource not explicitly
  // bank/cash. Treat as card-settled.
  if (rule.linkedCardId && rule.paymentSource !== "bank" && rule.paymentSource !== "cash") {
    return true;
  }
  return false;
}
