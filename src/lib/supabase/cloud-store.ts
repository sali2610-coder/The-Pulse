// Client-side cloud-truth read + write for entity tables.
//
// Every call goes through the `supabase()` client which carries the
// signed-in user's JWT — RLS policies on each table reject any row
// that doesn't match `auth.uid() = user_id`. There is no service-role
// usage and no server-side bypass. If the user isn't signed into
// Supabase, every helper short-circuits to a structured "no_session"
// or "not_configured" result.
//
// Empty-state protection lives in the consumers (richness guards in
// the hydration hook). These helpers ONLY fetch + write; they never
// decide whether to replace local state.

import { supabase } from "./client";
import {
  accountToRow,
  entryToRow,
  incomeToRow,
  loanToRow,
  rowToAccount,
  rowToEntry,
  rowToIncome,
  rowToLoan,
  rowToRule,
  ruleToRow,
} from "./row-mapping";
import type {
  Account,
  ExpenseEntry,
  Income,
  Loan,
  RecurringRule,
} from "@/types/finance";
import type { Database } from "./types";

export type Status =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "no_session" | "rls"; detail?: string };

export type CloudEntities = {
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  accounts: Account[];
  loans: Loan[];
  incomes: Income[];
};

export type CloudReadResult =
  | { ok: true; data: CloudEntities; userId: string }
  | { ok: false; reason: "not_configured" | "no_session" | "rls"; detail?: string };

async function getUserId(): Promise<string | null> {
  const client = supabase();
  if (!client) return null;
  const {
    data: { session },
  } = await client.auth.getSession();
  return session?.user?.id ?? null;
}

/** Verifies the configured project is reachable AND the signed-in
 *  user can SELECT from every entity table under RLS. Cheap — uses
 *  `head: true` so no rows transit the wire. */
export async function verifyCloudAccess(): Promise<{
  configured: boolean;
  authenticated: boolean;
  tables: Record<string, { ok: boolean; error?: string }>;
  allOk: boolean;
}> {
  const client = supabase();
  if (!client) {
    return {
      configured: false,
      authenticated: false,
      tables: {},
      allOk: false,
    };
  }
  const userId = await getUserId();
  const tables: Record<string, { ok: boolean; error?: string }> = {};
  const names = [
    "expense_entries",
    "accounts",
    "recurring_rules",
    "loans",
    "incomes",
  ] as const;
  await Promise.all(
    names.map(async (t) => {
      try {
        const builder = client.from(t) as unknown as {
          select: (
            cols: string,
            opts: { count: "exact"; head: true },
          ) => Promise<{ error: { message: string } | null }>;
        };
        const { error } = await builder.select("id", {
          count: "exact",
          head: true,
        });
        tables[t] = error ? { ok: false, error: error.message } : { ok: true };
      } catch (err) {
        tables[t] = {
          ok: false,
          error: err instanceof Error ? err.message : "unknown_error",
        };
      }
    }),
  );
  return {
    configured: true,
    authenticated: Boolean(userId),
    tables,
    allOk: Object.values(tables).every((t) => t.ok),
  };
}

/** Pull every entity belonging to the signed-in user. RLS guarantees
 *  this can never return another user's row. */
export async function fetchAllEntities(): Promise<CloudReadResult> {
  const client = supabase();
  if (!client) return { ok: false, reason: "not_configured" };
  const userId = await getUserId();
  if (!userId) return { ok: false, reason: "no_session" };

  // Run all five SELECTs in parallel.
  const [entriesRes, rulesRes, accountsRes, loansRes, incomesRes] =
    await Promise.all([
      client.from("expense_entries").select("*"),
      client.from("recurring_rules").select("*"),
      client.from("accounts").select("*"),
      client.from("loans").select("*"),
      client.from("incomes").select("*"),
    ]);

  const firstError =
    entriesRes.error ||
    rulesRes.error ||
    accountsRes.error ||
    loansRes.error ||
    incomesRes.error;
  if (firstError) {
    return { ok: false, reason: "rls", detail: firstError.message };
  }

  return {
    ok: true,
    userId,
    data: {
      entries: (entriesRes.data ?? []).map(rowToEntry),
      rules: (rulesRes.data ?? []).map(rowToRule),
      accounts: (accountsRes.data ?? []).map(rowToAccount),
      loans: (loansRes.data ?? []).map(rowToLoan),
      incomes: (incomesRes.data ?? []).map(rowToIncome),
    },
  };
}

// ── Single-entity upserts ────────────────────────────────────────────

async function upsertGeneric<T extends keyof Database["public"]["Tables"]>(
  table: T,
  rowOrRows: object | object[],
): Promise<Status> {
  const client = supabase();
  if (!client) return { ok: false, reason: "not_configured" };
  const userId = await getUserId();
  if (!userId) return { ok: false, reason: "no_session" };
  const builder = client.from(table) as unknown as {
    upsert: (
      rows: object | object[],
      opts: { onConflict: string },
    ) => Promise<{ error: { message: string } | null }>;
  };
  const { error } = await builder.upsert(rowOrRows, { onConflict: "id" });
  if (error) return { ok: false, reason: "rls", detail: error.message };
  return { ok: true };
}

export async function upsertEntry(e: ExpenseEntry): Promise<Status> {
  const userId = await getUserId();
  if (!userId) return { ok: false, reason: "no_session" };
  return upsertGeneric("expense_entries", entryToRow(e, userId));
}

export async function upsertAccount(a: Account): Promise<Status> {
  const userId = await getUserId();
  if (!userId) return { ok: false, reason: "no_session" };
  return upsertGeneric("accounts", accountToRow(a, userId));
}

export async function upsertRule(r: RecurringRule): Promise<Status> {
  const userId = await getUserId();
  if (!userId) return { ok: false, reason: "no_session" };
  return upsertGeneric("recurring_rules", ruleToRow(r, userId));
}

export async function upsertLoan(l: Loan): Promise<Status> {
  const userId = await getUserId();
  if (!userId) return { ok: false, reason: "no_session" };
  return upsertGeneric("loans", loanToRow(l, userId));
}

export async function upsertIncome(i: Income): Promise<Status> {
  const userId = await getUserId();
  if (!userId) return { ok: false, reason: "no_session" };
  return upsertGeneric("incomes", incomeToRow(i, userId));
}

// ── Single-entity deletes ────────────────────────────────────────────
// Required so a local delete propagates to Supabase. Without these,
// removing an account locally would re-appear on next hydration
// because cloud still held the row.

async function deleteGeneric<T extends keyof Database["public"]["Tables"]>(
  table: T,
  id: string,
): Promise<Status> {
  const client = supabase();
  if (!client) return { ok: false, reason: "not_configured" };
  const userId = await getUserId();
  if (!userId) return { ok: false, reason: "no_session" };
  // RLS still enforces auth.uid() = user_id; the eq on user_id below is
  // belt-and-braces against a misconfigured policy.
  const builder = client.from(table) as unknown as {
    delete: () => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => Promise<{
          error: { message: string } | null;
        }>;
      };
    };
  };
  const { error } = await builder.delete().eq("id", id).eq("user_id", userId);
  if (error) return { ok: false, reason: "rls", detail: error.message };
  return { ok: true };
}

export const deleteEntry = (id: string) =>
  deleteGeneric("expense_entries", id);
export const deleteAccount = (id: string) => deleteGeneric("accounts", id);
export const deleteRule = (id: string) => deleteGeneric("recurring_rules", id);
export const deleteLoan = (id: string) => deleteGeneric("loans", id);
export const deleteIncome = (id: string) => deleteGeneric("incomes", id);

// ── User settings (Phase 152d) ───────────────────────────────────────
// Single-row scalars (currently just monthlyBudget). Lives in its own
// table because it doesn't fit the entity-list shape. Upsert is keyed
// on user_id so writes are always one-row-per-user.

export async function fetchUserSettings(): Promise<
  | {
      ok: true;
      monthlyBudget: number;
      /** Phase 245 — undefined when the row/column has no explicit
       *  value yet. Callers MUST treat undefined as "cloud has nothing
       *  to say" and prefer the local value; the previous behaviour
       *  defaulted to "manual" which silently overwrote a legitimate
       *  local "auto" on hydrate. */
      budgetMode?: "manual" | "auto";
      budgetSafetyBuffer?: number;
      /** Phase 288 — global text-scale, persisted in the same
       *  user_settings row so reinstall on another device restores
       *  it. Undefined when the column doesn't exist yet (legacy
       *  schema) or the user has not set a preference. */
      textScale?: "compact" | "normal" | "large";
    }
  | { ok: false; reason: "not_configured" | "no_session" | "rls"; detail?: string }
> {
  const client = supabase();
  if (!client) return { ok: false, reason: "not_configured" };
  const userId = await getUserId();
  if (!userId) return { ok: false, reason: "no_session" };
  const builder = client.from("user_settings") as unknown as {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => {
        maybeSingle: () => Promise<{
          data: {
            monthly_budget: number;
            budget_mode?: string | null;
            budget_safety_buffer?: number | null;
            text_scale?: string | null;
          } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
  const { data, error } = await builder
    // Phase 214 — pull all settings columns. Missing columns return
    // undefined for older databases that haven't been migrated yet;
    // we coerce defaults below so legacy schemas keep working.
    // Phase 288 — text_scale added; same defensive fallback.
    .select("monthly_budget, budget_mode, budget_safety_buffer, text_scale")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    // Tolerate the specific case where the columns don't exist yet
    // (legacy schema). Re-select the old shape so the user still
    // gets monthlyBudget. Anything else propagates as before.
    if (/column .* does not exist/i.test(error.message)) {
      const legacy = await builder
        .select("monthly_budget")
        .eq("user_id", userId)
        .maybeSingle();
      if (legacy.error) {
        return { ok: false, reason: "rls", detail: legacy.error.message };
      }
      return {
        ok: true,
        monthlyBudget: legacy.data ? Number(legacy.data.monthly_budget) : 0,
        // Legacy schema has no budget_mode column at all — leave
        // undefined so the caller defers to the local value.
        budgetMode: undefined,
        budgetSafetyBuffer: undefined,
      };
    }
    return { ok: false, reason: "rls", detail: error.message };
  }
  // Distinguish explicit values from NULL. Cloud returns NULL when
  // the user hasn't set this preference yet; undefined here tells
  // the caller "no opinion" so it can preserve the local choice.
  const rawMode = data?.budget_mode;
  const budgetMode: "manual" | "auto" | undefined =
    rawMode === "auto" || rawMode === "manual" ? rawMode : undefined;
  const rawBuffer = data?.budget_safety_buffer;
  const budgetSafetyBuffer =
    typeof rawBuffer === "number" ? Number(rawBuffer) : undefined;
  const rawScale = data?.text_scale;
  const textScale: "compact" | "normal" | "large" | undefined =
    rawScale === "compact" || rawScale === "large" || rawScale === "normal"
      ? rawScale
      : undefined;
  return {
    ok: true,
    monthlyBudget: data ? Number(data.monthly_budget) : 0,
    budgetMode,
    budgetSafetyBuffer,
    textScale,
  };
}

export async function upsertUserSettings(args: {
  monthlyBudget: number;
  budgetMode?: "manual" | "auto";
  budgetSafetyBuffer?: number;
  /** Phase 288 — same row, new column. Defensive against missing
   *  column on legacy databases (the upsert retries without it). */
  textScale?: "compact" | "normal" | "large";
}): Promise<Status> {
  const client = supabase();
  if (!client) return { ok: false, reason: "not_configured" };
  const userId = await getUserId();
  if (!userId) return { ok: false, reason: "no_session" };
  const builder = client.from("user_settings") as unknown as {
    upsert: (
      rows: object,
      opts: { onConflict: string },
    ) => Promise<{ error: { message: string } | null }>;
  };
  const payload: Record<string, unknown> = {
    user_id: userId,
    monthly_budget: args.monthlyBudget,
  };
  // Only include the new columns when they're provided so a legacy
  // schema (no budget_mode column yet) doesn't reject the upsert.
  // The caller (use-cloud-sync) gates inclusion behind a runtime
  // capability flag flipped on first successful read.
  if (args.budgetMode !== undefined) payload.budget_mode = args.budgetMode;
  if (args.budgetSafetyBuffer !== undefined) {
    payload.budget_safety_buffer = args.budgetSafetyBuffer;
  }
  if (args.textScale !== undefined) {
    payload.text_scale = args.textScale;
  }
  const { error } = await builder.upsert(payload, { onConflict: "user_id" });
  if (error) {
    // Phase 214 — gracefully degrade when the schema is older. Drop
    // the new columns and retry with the legacy shape. Caller logs
    // a warning so the developer knows the migration is pending.
    if (/column .* (does not exist|cannot|unknown)/i.test(error.message)) {
      const legacy = await builder.upsert(
        { user_id: userId, monthly_budget: args.monthlyBudget },
        { onConflict: "user_id" },
      );
      if (legacy.error) {
        return { ok: false, reason: "rls", detail: legacy.error.message };
      }
      return { ok: true };
    }
    return { ok: false, reason: "rls", detail: error.message };
  }
  return { ok: true };
}

// ── Batch full-state push ────────────────────────────────────────────
// Used during cloud-write reconciliation when local has rich state but
// cloud has none (typically right after first sign-in). Uses upsert
// so it's idempotent under retries.

export async function pushAllEntities(args: {
  entries: ExpenseEntry[];
  rules: RecurringRule[];
  accounts: Account[];
  loans: Loan[];
  incomes: Income[];
}): Promise<Status> {
  const client = supabase();
  if (!client) return { ok: false, reason: "not_configured" };
  const userId = await getUserId();
  if (!userId) return { ok: false, reason: "no_session" };

  // Order matters: accounts before entries because entries.account_id
  // may reference an account; the FK is nullable so this is best-
  // effort, but the order minimizes a window where an entry refers to
  // an account that hasn't landed yet.
  const ops: Array<Promise<Status>> = [];
  if (args.accounts.length) {
    ops.push(
      upsertGeneric(
        "accounts",
        args.accounts.map((a) => accountToRow(a, userId)),
      ),
    );
  }
  if (args.rules.length) {
    ops.push(
      upsertGeneric(
        "recurring_rules",
        args.rules.map((r) => ruleToRow(r, userId)),
      ),
    );
  }
  if (args.loans.length) {
    ops.push(
      upsertGeneric(
        "loans",
        args.loans.map((l) => loanToRow(l, userId)),
      ),
    );
  }
  if (args.incomes.length) {
    ops.push(
      upsertGeneric(
        "incomes",
        args.incomes.map((i) => incomeToRow(i, userId)),
      ),
    );
  }
  if (args.entries.length) {
    ops.push(
      upsertGeneric(
        "expense_entries",
        args.entries.map((e) => entryToRow(e, userId)),
      ),
    );
  }
  const results = await Promise.all(ops);
  const failed = results.find((r) => !r.ok);
  if (failed && !failed.ok) {
    return { ok: false, reason: failed.reason, detail: failed.detail };
  }
  return { ok: true };
}
