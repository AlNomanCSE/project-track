create table if not exists public.project_tasks (
  id text primary key,
  title text not null,
  description text not null default '',
  change_points jsonb not null default '[]'::jsonb,
  requested_date date not null,
  client_name text,
  status text not null,
  eta_date date,
  delivery_date date,
  confirmed_date date,
  approved_date date,
  estimated_hours numeric not null default 0,
  logged_hours numeric not null default 0,
  hourly_rate numeric,
  start_date date,
  completed_date date,
  handover_date date,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  history jsonb not null default '[]'::jsonb,
  hour_revisions jsonb not null default '[]'::jsonb
);

alter table public.project_tasks enable row level security;

drop policy if exists "project tasks select" on public.project_tasks;
create policy "project tasks select"
  on public.project_tasks
  for select
  to anon
  using (true);

drop policy if exists "project tasks insert" on public.project_tasks;
create policy "project tasks insert"
  on public.project_tasks
  for insert
  to anon
  with check (true);

drop policy if exists "project tasks update" on public.project_tasks;
create policy "project tasks update"
  on public.project_tasks
  for update
  to anon
  using (true)
  with check (true);

drop policy if exists "project tasks delete" on public.project_tasks;
create policy "project tasks delete"
  on public.project_tasks
  for delete
  to anon
  using (true);

-- Migrate old snapshot-style storage if it exists (project_tracker_state.tasks JSON array)
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'project_tracker_state'
  ) then
    insert into public.project_tasks (
      id,
      title,
      description,
      change_points,
      requested_date,
      client_name,
      status,
      eta_date,
      delivery_date,
      confirmed_date,
      approved_date,
      estimated_hours,
      logged_hours,
      hourly_rate,
      start_date,
      completed_date,
      handover_date,
      created_at,
      updated_at,
      history,
      hour_revisions
    )
    select
      task->>'id',
      coalesce(task->>'title', ''),
      coalesce(task->>'description', ''),
      coalesce(task->'changePoints', '[]'::jsonb),
      coalesce((task->>'requestedDate')::date, current_date),
      nullif(task->>'clientName', ''),
      coalesce(task->>'status', 'Requested'),
      nullif(task->>'etaDate', '')::date,
      nullif(task->>'deliveryDate', '')::date,
      nullif(task->>'confirmedDate', '')::date,
      nullif(task->>'approvedDate', '')::date,
      coalesce((task->>'estimatedHours')::numeric, 0),
      coalesce((task->>'loggedHours')::numeric, 0),
      nullif(task->>'hourlyRate', '')::numeric,
      nullif(task->>'startDate', '')::date,
      nullif(task->>'completedDate', '')::date,
      nullif(task->>'handoverDate', '')::date,
      coalesce((task->>'createdAt')::timestamptz, now()),
      coalesce((task->>'updatedAt')::timestamptz, now()),
      coalesce(task->'history', '[]'::jsonb),
      coalesce(task->'hourRevisions', '[]'::jsonb)
    from public.project_tracker_state pts,
    lateral jsonb_array_elements(pts.tasks) as task
    where coalesce(task->>'id', '') <> ''
    on conflict (id) do update set
      title = excluded.title,
      description = excluded.description,
      change_points = excluded.change_points,
      requested_date = excluded.requested_date,
      client_name = excluded.client_name,
      status = excluded.status,
      eta_date = excluded.eta_date,
      delivery_date = excluded.delivery_date,
      confirmed_date = excluded.confirmed_date,
      approved_date = excluded.approved_date,
      estimated_hours = excluded.estimated_hours,
      logged_hours = excluded.logged_hours,
      hourly_rate = excluded.hourly_rate,
      start_date = excluded.start_date,
      completed_date = excluded.completed_date,
      handover_date = excluded.handover_date,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      history = excluded.history,
      hour_revisions = excluded.hour_revisions;
  end if;
end $$;
