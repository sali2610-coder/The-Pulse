-- Phase 214 — extend user_settings with budget_mode + budget_safety_buffer.
--
-- Idempotent so re-running the migration on an existing database is
-- safe. Defaults match the local store defaults ("manual" + 0) so
-- legacy rows behave unchanged after the column is added.
--
-- The application code in src/lib/supabase/cloud-store.ts tolerates
-- a pre-migration database too — fetchUserSettings + upsertUserSettings
-- gracefully fall back to the legacy single-column shape when these
-- columns aren't present yet. That means rolling out the migration is
-- non-blocking; the cloud-sync just starts persisting the new fields
-- the moment the columns appear.

alter table public.user_settings
  add column if not exists budget_mode text not null default 'manual',
  add column if not exists budget_safety_buffer numeric(14,2) not null default 0;

-- Constrain budget_mode to the two values the code understands.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_settings_budget_mode_check'
  ) then
    alter table public.user_settings
      add constraint user_settings_budget_mode_check
      check (budget_mode in ('manual', 'auto'));
  end if;
end$$;
