-- Per-user settings (Phase 152d).
--
-- Houses user-level scalars that don't fit the existing entity tables
-- — currently just `monthly_budget`, designed so future scalars
-- (default currency, locale, audio flag) can land here as additional
-- columns without changing the consumer shape.
--
-- One row per user. PRIMARY KEY on user_id so upsert is idempotent and
-- writes can never accumulate duplicates.

create table if not exists public.user_settings (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  monthly_budget numeric(14,2) not null default 0,
  updated_at     timestamptz not null default now()
);

create trigger user_settings_set_updated_at before update on public.user_settings
  for each row execute function set_updated_at();

alter table public.user_settings enable row level security;
create policy "owner_select" on public.user_settings for select using (auth.uid() = user_id);
create policy "owner_insert" on public.user_settings for insert with check (auth.uid() = user_id);
create policy "owner_update" on public.user_settings for update using (auth.uid() = user_id);
create policy "owner_delete" on public.user_settings for delete using (auth.uid() = user_id);
