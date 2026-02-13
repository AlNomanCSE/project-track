create table if not exists public.project_tracker_state (
  id text primary key,
  tasks jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.project_tracker_state enable row level security;

drop policy if exists "project tracker state select" on public.project_tracker_state;
create policy "project tracker state select"
  on public.project_tracker_state
  for select
  to anon
  using (true);

drop policy if exists "project tracker state insert" on public.project_tracker_state;
create policy "project tracker state insert"
  on public.project_tracker_state
  for insert
  to anon
  with check (true);

drop policy if exists "project tracker state update" on public.project_tracker_state;
create policy "project tracker state update"
  on public.project_tracker_state
  for update
  to anon
  using (true)
  with check (true);

insert into public.project_tracker_state (id, tasks)
values ('default', '[]'::jsonb)
on conflict (id) do nothing;
