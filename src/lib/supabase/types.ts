// Supabase database types.
//
// Hand-written initial draft. Once the schema lands in production
// this file gets regenerated via `supabase gen types typescript`.
// Until then, keep the shape conservative and consistent with the
// existing Zustand store entities so the sync processor maps cleanly.
//
// Naming convention:
//   - DB rows use snake_case (matches Postgres convention).
//   - Each row carries `user_id` for RLS row-ownership checks.
//   - Each row carries `updated_at` for last-writer-wins reconciliation.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type DbExpenseEntry = {
  id: string;
  user_id: string;
  amount: number;
  category: string;
  note: string | null;
  source: string;
  payment_method: "cash" | "credit";
  installments: number;
  charge_date: string;
  created_at: string;
  updated_at: string;
  matched_rule_id: string | null;
  external_id: string | null;
  issuer: string | null;
  card_last4: string | null;
  merchant: string | null;
  is_refund: boolean | null;
  currency: string | null;
  bank_pending: boolean | null;
  needs_confirmation: boolean | null;
  confirmed_at: string | null;
  account_id: string | null;
  exclude_from_budget: boolean | null;
  raw_notification_body: string | null;
};

export type DbAccount = {
  id: string;
  user_id: string;
  kind: "bank" | "card";
  label: string;
  issuer: string | null;
  card_last4: string | null;
  anchor_balance: number | null;
  anchor_updated_at: string | null;
  active: boolean;
  billing_day: number | null;
  payment_day: number | null;
  credit_limit: number | null;
  current_debt: number | null;
  color: string | null;
  created_at: string;
  updated_at: string;
};

export type DbRecurringRule = {
  id: string;
  user_id: string;
  label: string;
  category: string;
  estimated_amount: number;
  day_of_month: number;
  keywords: string[];
  active: boolean;
  installment_total: number | null;
  start_month: number | null;
  start_year: number | null;
  payment_source: string | null;
  linked_card_id: string | null;
  created_at: string;
  updated_at: string;
};

export type DbLoan = {
  id: string;
  user_id: string;
  label: string;
  monthly_installment: number;
  day_of_month: number;
  start_month: number | null;
  start_year: number | null;
  total_payments: number | null;
  end_date: string | null;
  remaining_balance: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type DbIncome = {
  id: string;
  user_id: string;
  label: string;
  amount: number;
  day_of_month: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type DbUserSettings = {
  user_id: string;
  monthly_budget: number;
  updated_at: string;
};

export type DbBackup = {
  id: string;
  user_id: string;
  reason: string;
  payload: Json;
  counts: Json;
  captured_at: string;
};

export type DbSyncMutation = {
  id: string;
  user_id: string;
  kind: string;
  payload: Json;
  ts: string;
  applied_at: string | null;
  attempts: number;
  last_error: string | null;
};

export type Database = {
  public: {
    Tables: {
      expense_entries: {
        Row: DbExpenseEntry;
        Insert: Omit<DbExpenseEntry, "user_id" | "updated_at"> & {
          user_id?: string;
          updated_at?: string;
        };
        Update: Partial<DbExpenseEntry>;
      };
      accounts: {
        Row: DbAccount;
        Insert: Omit<DbAccount, "user_id" | "updated_at"> & {
          user_id?: string;
          updated_at?: string;
        };
        Update: Partial<DbAccount>;
      };
      recurring_rules: {
        Row: DbRecurringRule;
        Insert: Omit<DbRecurringRule, "user_id" | "updated_at"> & {
          user_id?: string;
          updated_at?: string;
        };
        Update: Partial<DbRecurringRule>;
      };
      loans: {
        Row: DbLoan;
        Insert: Omit<DbLoan, "user_id" | "updated_at"> & {
          user_id?: string;
          updated_at?: string;
        };
        Update: Partial<DbLoan>;
      };
      incomes: {
        Row: DbIncome;
        Insert: Omit<DbIncome, "user_id" | "updated_at"> & {
          user_id?: string;
          updated_at?: string;
        };
        Update: Partial<DbIncome>;
      };
      backups: {
        Row: DbBackup;
        Insert: Omit<DbBackup, "user_id"> & { user_id?: string };
        Update: Partial<DbBackup>;
      };
      user_settings: {
        Row: DbUserSettings;
        Insert: Omit<DbUserSettings, "updated_at"> & {
          updated_at?: string;
        };
        Update: Partial<DbUserSettings>;
      };
      sync_mutations: {
        Row: DbSyncMutation;
        Insert: Omit<DbSyncMutation, "user_id"> & { user_id?: string };
        Update: Partial<DbSyncMutation>;
      };
    };
  };
};
