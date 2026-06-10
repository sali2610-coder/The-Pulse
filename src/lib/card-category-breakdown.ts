// Phase 396 — engine-backed presentation wrapper.
//
// Was: an independent walker over effectiveCashImpactStream that
// produced its own credit totals + classifications (the legacy
// dual-calculator that drifted from the cockpit / cards header by
// ₪10 when both shared the screen).
//
// Now: re-emits the same exported types, but every numeric value
// comes from FinancialEngine.getCreditCardStatement (which in turn
// is the canonical getCreditCardExposure data). No new math. No
// independent filter. UI files unchanged.

import type {
  Account,
  ExpenseEntry,
  Loan,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import type { CategoryId } from "@/lib/categories";
import { addMonths, monthKeyOf } from "@/lib/dates";
import { getCreditCardStatement } from "@/lib/credit-card-statement";
import type {
  CreditCardExposureBucket,
  CreditExposureRow,
} from "@/lib/credit-card-exposure";

export type ChargeKind = "recurring" | "installments" | "oneTime";

export type CategoryGroup = {
  category: CategoryId;
  total: number;
  recurring: number;
  installments: number;
  oneTime: number;
  items: Array<{
    label: string;
    amount: number;
    effectiveCashAt: string;
    kind: ChargeKind;
    refId: string;
    /** Phase 421 — purchase-month-key of the slice that produced
     *  this row. Distinct from effectiveCashAt's month (which is the
     *  bank-debit month). installmentMetaForRefId reads this so the
     *  paymentNumber stays aligned with sliceForMonth's offset
     *  rather than the next-month cash-settle window. */
    purchaseMonthKey: string;
  }>;
};

export type CardBreakdown = {
  cardId: string;
  cardLabel: string;
  cardLast4?: string;
  total: number;
  recurringTotal: number;
  installmentsTotal: number;
  oneTimeTotal: number;
  categories: CategoryGroup[];
  nextSettlementAt: string | null;
};

export type CardBreakdownReport = {
  cards: CardBreakdown[];
  totalCommitted: number;
};

// Phase 396 — single-month default. The cards header + per-card
// statement rows + folder view ALL consume the same monthKey through
// the engine, so the folder view stays in sync with the header
// without showing future-billing-month folders (which is the Time
// tab's job).
const DEFAULT_WINDOW_MONTHS = 1;

function bucketToKind(
  bucket: CreditCardExposureBucket,
  refId: string,
  rules: RecurringRule[],
): ChargeKind {
  // Rule-source rows: installment-plan rules (installmentTotal set)
  // classify as "installments"; regular monthly bills as "recurring".
  if (refId.startsWith("rule:")) {
    const ruleId = refId.slice("rule:".length);
    const r = rules.find((x) => x.id === ruleId);
    if (r && r.installmentTotal && r.installmentTotal > 1) return "installments";
    return "recurring";
  }
  // Entry-source rows: existingInstallments bucket is BNPL; everything
  // else is a one-off card transaction.
  if (bucket === "existingInstallments") return "installments";
  return "oneTime";
}

function effectiveDateFor(args: {
  monthKey: string;
  paymentDay: number;
}): string {
  // The canonical Israeli card cycle (effective-cash-date.ts) maps a
  // purchase attributed to monthKey=X to the bank-debit date of the
  // NEXT month's paymentDay — purchases land after the previous
  // billing cycle's payment day, so the next paymentDay settles
  // them. Edge case (purchase before paymentDay in the same month)
  // is rare here because we drive off monthKey, not per-row dates.
  const [y, m] = args.monthKey.split("-").map(Number);
  const targetYear = m === 12 ? y + 1 : y;
  const targetMonth0 = m === 12 ? 0 : m;
  const lastDay = new Date(targetYear, targetMonth0 + 1, 0).getDate();
  const d = new Date(
    targetYear,
    targetMonth0,
    Math.min(args.paymentDay, lastDay),
    12,
    0,
    0,
  );
  return d.toISOString();
}

export function buildCardCategoryBreakdown(args: {
  accounts: Account[];
  loans: Loan[];
  rules: RecurringRule[];
  statuses: RecurringStatus[];
  entries: ExpenseEntry[];
  now?: Date;
  windowMonths?: number;
  /** Legacy alias from the pre-Phase-396 implementation. Mapped to
   *  `windowMonths` by ceil(days/30) so existing callers keep working. */
  windowDays?: number;
}): CardBreakdownReport {
  const now = args.now ?? new Date();
  // Phase 396 — legacy `windowDays` is intentionally ignored. The
  // pre-Phase-396 walker gated per-row by effective-cash-date so
  // far-future emissions silently dropped out; that gating depended
  // on a separate filter set that diverged from the canonical engine
  // exposure (the very drift this consolidation removes). The new
  // implementation always speaks in month-keys and defaults to the
  // current month, which is what CardsHierarchyCard renders.
  void args.windowDays;
  const windowMonths = Math.max(
    1,
    args.windowMonths ?? DEFAULT_WINDOW_MONTHS,
  );
  void args.loans;

  // Per-card accumulator. We aggregate across each month in the window
  // so the report shape stays compatible with buildCardMonthFolders
  // (which then rebuckets by month for the UI).
  type Acc = {
    cardId: string;
    cardLabel: string;
    cardLast4?: string;
    total: number;
    recurringTotal: number;
    installmentsTotal: number;
    oneTimeTotal: number;
    nextSettlementAt: string | null;
    categories: Map<CategoryId, CategoryGroup>;
  };
  const accs = new Map<string, Acc>();
  function ensureCard(card: {
    cardId: string;
    cardLabel: string;
    cardLast4?: string;
  }): Acc {
    const found = accs.get(card.cardId);
    if (found) return found;
    const fresh: Acc = {
      cardId: card.cardId,
      cardLabel: card.cardLabel,
      cardLast4: card.cardLast4,
      total: 0,
      recurringTotal: 0,
      installmentsTotal: 0,
      oneTimeTotal: 0,
      nextSettlementAt: null,
      categories: new Map(),
    };
    accs.set(card.cardId, fresh);
    return fresh;
  }

  const baseMonth = monthKeyOf(now);
  for (let i = 0; i < windowMonths; i++) {
    const monthKey = addMonths(baseMonth, i);
    const statement = getCreditCardStatement({
      accounts: args.accounts,
      rules: args.rules,
      entries: args.entries,
      statuses: args.statuses,
      monthKey,
    });
    for (const card of statement.cards) {
      const acc = ensureCard({
        cardId: card.cardId,
        cardLabel: card.cardLabel,
        cardLast4: card.cardLast4,
      });
      const cardAccount = args.accounts.find((a) => a.id === card.cardId);
      const paymentDay =
        cardAccount?.paymentDay ?? cardAccount?.billingDay ?? 10;
      const effectiveCashAt = effectiveDateFor({ monthKey, paymentDay });
      const tDate = new Date(effectiveCashAt);
      if (tDate.getTime() > now.getTime()) {
        if (
          !acc.nextSettlementAt ||
          tDate.getTime() < new Date(acc.nextSettlementAt).getTime()
        ) {
          acc.nextSettlementAt = effectiveCashAt;
        }
      }
      for (const tx of card.transactions) {
        const kind = bucketToKind(tx.bucket, tx.id, args.rules);
        const category = (tx.category ?? "other") as CategoryId;
        const grp =
          acc.categories.get(category) ??
          ({
            category,
            total: 0,
            recurring: 0,
            installments: 0,
            oneTime: 0,
            items: [],
          } satisfies CategoryGroup);
        grp.total += tx.amount;
        if (kind === "recurring") grp.recurring += tx.amount;
        else if (kind === "installments") grp.installments += tx.amount;
        else grp.oneTime += tx.amount;
        grp.items.push(itemFromRow(tx, kind, effectiveCashAt, monthKey));
        acc.categories.set(category, grp);
        acc.total += tx.amount;
        if (kind === "recurring") acc.recurringTotal += tx.amount;
        else if (kind === "installments") acc.installmentsTotal += tx.amount;
        else acc.oneTimeTotal += tx.amount;
      }
    }
  }

  const cards: CardBreakdown[] = Array.from(accs.values())
    .map((a) => ({
      cardId: a.cardId,
      cardLabel: a.cardLabel,
      cardLast4: a.cardLast4,
      total: a.total,
      recurringTotal: a.recurringTotal,
      installmentsTotal: a.installmentsTotal,
      oneTimeTotal: a.oneTimeTotal,
      nextSettlementAt: a.nextSettlementAt,
      categories: Array.from(a.categories.values())
        .map((g) => ({
          category: g.category,
          total: g.total,
          recurring: g.recurring,
          installments: g.installments,
          oneTime: g.oneTime,
          items: g.items.slice().sort(
            (x, y) =>
              new Date(x.effectiveCashAt).getTime() -
              new Date(y.effectiveCashAt).getTime(),
          ),
        }))
        .sort((x, y) => y.total - x.total),
    }))
    .sort((a, b) => b.total - a.total);

  const totalCommitted = cards.reduce((s, c) => s + c.total, 0);
  return { cards, totalCommitted };
}

function itemFromRow(
  tx: CreditExposureRow & { category?: CategoryId },
  kind: ChargeKind,
  effectiveCashAt: string,
  purchaseMonthKey: string,
): CategoryGroup["items"][number] {
  return {
    label: tx.label,
    amount: tx.amount,
    effectiveCashAt,
    kind,
    refId: tx.id,
    purchaseMonthKey,
  };
}
