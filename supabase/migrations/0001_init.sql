-- Finance Tracker — sync schema
-- One envelope table holds every synced item. Row Level Security makes each user
-- see and write only their own rows, so the public anon key is safe in the browser.

create table if not exists public.records (
  user_id    uuid    not null references auth.users on delete cascade default auth.uid(),
  collection text    not null,        -- 'transactions' | 'savingGoals' | 'recurringRules' | 'settings'
  id         text    not null,        -- the record id from the app
  data       jsonb,                   -- the full record (null for a delete tombstone)
  updated_at bigint  not null,        -- client timestamp (ms) for last-write-wins
  deleted    boolean not null default false,
  primary key (user_id, collection, id)
);

alter table public.records enable row level security;

drop policy if exists "records_select_own" on public.records;
drop policy if exists "records_insert_own" on public.records;
drop policy if exists "records_update_own" on public.records;
drop policy if exists "records_delete_own" on public.records;

create policy "records_select_own" on public.records
  for select using (auth.uid() = user_id);

create policy "records_insert_own" on public.records
  for insert with check (auth.uid() = user_id);

create policy "records_update_own" on public.records
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "records_delete_own" on public.records
  for delete using (auth.uid() = user_id);

create index if not exists records_user_updated_idx
  on public.records (user_id, updated_at);
