import type {
  ExpenseEntry,
  RecurringRule,
  RecurringStatus,
} from "@/types/finance";
import { buildStatusMap } from "@/lib/projections";
import { monthKeyOf } from "@/lib/dates";

const AMOUNT_TOLERANCE = 0.25;

function normalize(text: string | undefined): string {
  return (text ?? "").toLowerCase().trim();
}

function amountMatches(actual: number, estimated: number): boolean {
  if (estimated <= 0) return false;
  const diff = Math.abs(actual - estimated) / estimated;
  return diff <= AMOUNT_TOLERANCE;
}

function keywordMatches(rule: RecurringRule, entry: ExpenseEntry): boolean {
  if (rule.keywords.length === 0) return false;
  const note = normalize(entry.note);
  const label = normalize(rule.label);
  if (!note && !label) return false;
  return rule.keywords.some((kw) => {
    const k = normalize(kw);
    return k && (note.includes(k) || label.includes(k));
  });
}

export function findMatchingRule(args: {
  entry: ExpenseEntry;
  rules: RecurringRule[];
  statuses: RecurringStatus[];
}): RecurringRule | undefined {
  const monthKey = monthKeyOf(new Date(args.entry.chargeDate));
  const statusMap = buildStatusMap(args.statuses);

  const candidates = args.rules.filter((rule) => {
    if (!rule.active) return false;
    if (rule.category !== args.entry.category) return false;
    const status = statusMap.get(`${rule.id}__${monthKey}`);
    return status?.status !== "paid";
  });

  return (
    candidates.find(
      (rule) =>
        amountMatches(args.entry.amount, rule.estimatedAmount) ||
        keywordMatches(rule, args.entry),
    ) ?? undefined
  );
}
