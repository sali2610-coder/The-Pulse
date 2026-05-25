// Phase 224 — re-importer for Sally's own CSV export.
//
// Closes the export ↔ import loop on csv-export.ts. The export file
// is the canonical archive; the importer hydrates state from it after
// a hard reset, a device move, or a long offline window. Idempotent:
// the same export file imported twice yields the same store state
// because every row's externalId is preserved (and the store's
// existing dedup short-circuits on the second pass).
//
// Pure compute. Returns AddExpenseInput-shaped rows + diagnostics —
// the UI decides whether to call addExpense per row or stop on
// validation errors. Mapping mirrors entriesToCsv exactly so any
// drift is caught by the roundtrip test.

import { CATEGORY_IDS, type CategoryId } from "@/lib/categories";
import type {
  ExpenseSource,
  Issuer,
  PaymentMethod,
} from "@/types/finance";
import { parseCsvRows } from "@/lib/csv-parse-rows";

export type SallyImportRow = {
  amount: number;
  category: CategoryId;
  chargeDate: string;
  installments: number;
  paymentMethod: PaymentMethod;
  source: ExpenseSource;
  externalId?: string;
  issuer?: Issuer;
  cardLast4?: string;
  accountId?: string;
  merchant?: string;
  note?: string;
  bankPending?: boolean;
  needsConfirmation?: boolean;
};

export type SallyImportResult =
  | {
      ok: true;
      rows: SallyImportRow[];
      warnings: string[];
    }
  | {
      ok: false;
      reason:
        | "empty_file"
        | "missing_required_header"
        | "no_data_rows";
      detail?: string;
    };

const REQUIRED_HEADERS = [
  "chargeDate",
  "amount",
  "category",
  "paymentMethod",
  "installments",
  "source",
] as const;

const ISSUERS = new Set<Issuer>([
  "cal",
  "max",
  "isracard",
  "amex",
  "hapoalim",
  "leumi",
  "discount",
  "mizrahi",
  "fibi",
  "visa",
  "mastercard",
  "other",
]);

const PAYMENT_METHODS = new Set<PaymentMethod>(["cash", "credit"]);
const SOURCES = new Set<ExpenseSource>(["manual", "auto", "sms", "wallet"]);

function safeNum(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function strip(raw: string): string {
  return raw.trim();
}

function pickIfPresent(map: Record<string, string>, k: string): string {
  const v = map[k];
  return v !== undefined ? v : "";
}

/** Hex-stripped deterministic id used when the source file row has
 *  no externalId. Anchored on the few fields the store dedup also
 *  considers, so re-importing the same file remains idempotent. */
function syntheticExternalId(args: {
  chargeDate: string;
  amount: number;
  merchant?: string;
  source: ExpenseSource;
}): string {
  const m = (args.merchant ?? "").replace(/\s+/g, " ").trim();
  return `import:sally:${args.source}:${args.chargeDate}:${args.amount.toFixed(2)}:${m}`;
}

export function parseSallyCsv(text: string): SallyImportResult {
  if (!text.trim()) {
    return { ok: false, reason: "empty_file" };
  }
  const rows = parseCsvRows(text);
  if (rows.length === 0) {
    return { ok: false, reason: "empty_file" };
  }
  const header = rows[0].map(strip);
  const missing = REQUIRED_HEADERS.filter((h) => !header.includes(h));
  if (missing.length > 0) {
    return {
      ok: false,
      reason: "missing_required_header",
      detail: missing.join(","),
    };
  }
  if (rows.length === 1) {
    return { ok: false, reason: "no_data_rows" };
  }

  const warnings: string[] = [];
  const out: SallyImportRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    // Skip empty trailing rows (handled by parseCsvRows but defensive).
    if (cells.length === 1 && cells[0] === "") continue;

    const map: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) {
      map[header[j]] = cells[j] ?? "";
    }

    const amount = safeNum(pickIfPresent(map, "amount"));
    if (amount === null || amount <= 0) {
      warnings.push(`row ${i + 1}: invalid amount`);
      continue;
    }

    const category = strip(pickIfPresent(map, "category")) as CategoryId;
    if (!(CATEGORY_IDS as readonly string[]).includes(category)) {
      warnings.push(`row ${i + 1}: unknown category "${category}"`);
      continue;
    }

    const pm = strip(pickIfPresent(map, "paymentMethod"));
    if (!PAYMENT_METHODS.has(pm as PaymentMethod)) {
      warnings.push(`row ${i + 1}: invalid paymentMethod "${pm}"`);
      continue;
    }

    const src = strip(pickIfPresent(map, "source"));
    if (!SOURCES.has(src as ExpenseSource)) {
      warnings.push(`row ${i + 1}: invalid source "${src}"`);
      continue;
    }

    const chargeDate = strip(pickIfPresent(map, "chargeDate"));
    if (!chargeDate) {
      warnings.push(`row ${i + 1}: missing chargeDate`);
      continue;
    }

    const installmentsRaw = safeNum(pickIfPresent(map, "installments"));
    const installments =
      installmentsRaw !== null && installmentsRaw >= 1
        ? Math.floor(installmentsRaw)
        : 1;

    const issuer = strip(pickIfPresent(map, "issuer"));
    const issuerSafe = ISSUERS.has(issuer as Issuer)
      ? (issuer as Issuer)
      : undefined;

    const merchant = strip(pickIfPresent(map, "merchant")) || undefined;
    const note = strip(pickIfPresent(map, "note")) || undefined;
    const cardLast4 = strip(pickIfPresent(map, "cardLast4")) || undefined;
    const accountId = strip(pickIfPresent(map, "accountId")) || undefined;

    const externalIdRaw = strip(pickIfPresent(map, "externalId"));
    const externalId =
      externalIdRaw ||
      syntheticExternalId({
        chargeDate,
        amount,
        merchant,
        source: src as ExpenseSource,
      });

    const bankPending = strip(pickIfPresent(map, "bankPending")) === "true";
    const needsConfirmation =
      strip(pickIfPresent(map, "needsConfirmation")) === "true";

    out.push({
      amount,
      category,
      chargeDate,
      installments,
      paymentMethod: pm as PaymentMethod,
      source: src as ExpenseSource,
      externalId,
      issuer: issuerSafe,
      cardLast4,
      accountId,
      merchant,
      note,
      bankPending: bankPending || undefined,
      needsConfirmation: needsConfirmation || undefined,
    });
  }

  return { ok: true, rows: out, warnings };
}
