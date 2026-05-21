-- The Pulse — initial Supabase schema.
--
-- Apply with `supabase db push` or paste into the Supabase SQL editor
-- in order. Every table carries `user_id` for Row-Level-Security and
-- `updated_at` for last-writer-wins reconciliation. Schema mirrors the
-- existing Zustand store shape so the sync processor can upsert
-- without a translation layer.

create extension if not exists "pgcrypto";

-- ──────────────────────────────────────────────────────────────────────
-- Helper: updated_at maintenance trigger.
-- ──────────────────────────────────────────────────────────────────────
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ──────────────────────────────────────────────────────────────────────
-- expense_entries
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.expense_entries (
  id              text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  amount          numeric(12,2) not null,
  category        text not null,
  note            text,
  source          text not null,
  payment_method  text not null check (payment_method in ('cash','credit')),
  installments    integer not null default 1,
  charge_date     timestamptz not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  matched_rule_id text,
  external_id     text,
  issuer          text,
  card_last4      text,
  merchant        text,
  is_refund       boolean,
  currency        text,
  bank_pending    boolean,
  needs_confirmation boolean,
  confirmed_at    timestamptz,
  account_id      text,
  exclude_from_budget boolean,
  raw_notification_body text
);
create index if not exists expense_entries_user_idx on public.expense_entries (user_id, charge_date desc);
create unique index if not exists expense_entries_user_external on public.expense_entries (user_id, external_id) where external_id is not null;
create trigger expense_entries_set_updated_at before update on public.expense_entries
  for each row execute function set_updated_at();
alter table public.expense_entries enable row level security;
create policy "owner_select" on public.expense_entries for select using (auth.uid() = user_id);
create policy "owner_insert" on public.expense_entries for insert with check (auth.uid() = user_id);
create policy "owner_update" on public.expense_entries for update using (auth.uid() = user_id);
create policy "owner_delete" on public.expense_entries for delete using (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────
-- accounts
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.accounts (
  id                 text primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  kind               text not null check (kind in ('bank','card')),
  label              text not null,
  issuer             text,
  card_last4         text,
  anchor_balance     numeric(14,2),
  anchor_updated_at  timestamptz,
  active             boolean not null default true,
  billing_day        integer,
  payment_day        integer,
  credit_limit       numeric(14,2),
  current_debt       numeric(14,2),
  color              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists accounts_user_idx on public.accounts (user_id);
create trigger accounts_set_updated_at before update on public.accounts
  for each row execute function set_updated_at();
alter table public.accounts enable row level security;
create policy "owner_select" on public.accounts for select using (auth.uid() = user_id);
create policy "owner_insert" on public.accounts for insert with check (auth.uid() = user_id);
create policy "owner_update" on public.accounts for update using (auth.uid() = user_id);
create policy "owner_delete" on public.accounts for delete using (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────
-- recurring_rules
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.recurring_rules (
  id                  text primary key,
  user_id             uuid not null references auth.users(id) on delete cascade,
  label               text not null,
  category            text not null,
  estimated_amount    numeric(12,2) not null,
  day_of_month        integer not null,
  keywords            text[] not null default '{}',
  active              boolean not null default true,
  installment_total   integer,
  start_month         integer,
  start_year          integer,
  payment_source      text,
  linked_card_id      text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists recurring_rules_user_idx on public.recurring_rules (user_id);
create trigger recurring_rules_set_updated_at before update on public.recurring_rules
  for each row execute function set_updated_at();
alter table public.recurring_rules enable row level security;
create policy "owner_select" on public.recurring_rules for select using (auth.uid() = user_id);
create policy "owner_insert" on public.recurring_rules for insert with check (auth.uid() = user_id);
create policy "owner_update" on public.recurring_rules for update using (auth.uid() = user_id);
create policy "owner_delete" on public.recurring_rules for delete using (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────
-- loans
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.loans (
  id                   text primary key,
  user_id              uuid not null references auth.users(id) on delete cascade,
  label                text not null,
  monthly_installment  numeric(12,2) not null,
  day_of_month         integer not null,
  start_month          integer,
  start_year           integer,
  total_payments       integer,
  end_date             timestamptz,
  remaining_balance    numeric(14,2),
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists loans_user_idx on public.loans (user_id);
create trigger loans_set_updated_at before update on public.loans
  for each row execute function set_updated_at();
alter table public.loans enable row level security;
create policy "owner_select" on public.loans for select using (auth.uid() = user_id);
create policy "owner_insert" on public.loans for insert with check (auth.uid() = user_id);
create policy "owner_update" on public.loans for update using (auth.uid() = user_id);
create policy "owner_delete" on public.loans for delete using (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────
-- incomes
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.incomes (
  id            text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  label         text not null,
  amount        numeric(12,2) not null,
  day_of_month  integer not null,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists incomes_user_idx on public.incomes (user_id);
create trigger incomes_set_updated_at before update on public.incomes
  for each row execute function set_updated_at();
alter table public.incomes enable row level security;
create policy "owner_select" on public.incomes for select using (auth.uid() = user_id);
create policy "owner_insert" on public.incomes for insert with check (auth.uid() = user_id);
create policy "owner_update" on public.incomes for update using (auth.uid() = user_id);
create policy "owner_delete" on public.incomes for delete using (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────
-- backups
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.backups (
  id            text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  reason        text not null,
  payload       jsonb not null,
  counts        jsonb,
  captured_at   timestamptz not null default now()
);
create index if not exists backups_user_idx on public.backups (user_id, captured_at desc);
alter table public.backups enable row level security;
create policy "owner_select" on public.backups for select using (auth.uid() = user_id);
create policy "owner_insert" on public.backups for insert with check (auth.uid() = user_id);
create policy "owner_delete" on public.backups for delete using (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────
-- sync_mutations (server-side audit log of applied mutations)
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.sync_mutations (
  id            text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null,
  payload       jsonb not null,
  ts            timestamptz not null,
  applied_at    timestamptz,
  attempts      integer not null default 0,
  last_error    text
);
create index if not exists sync_mutations_user_idx on public.sync_mutations (user_id, ts desc);
alter table public.sync_mutations enable row level security;
create policy "owner_select" on public.sync_mutations for select using (auth.uid() = user_id);
create policy "owner_insert" on public.sync_mutations for insert with check (auth.uid() = user_id);
create policy "owner_update" on public.sync_mutations for update using (auth.uid() = user_id);
