begin;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------

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
  client_review_date date,
  confirmed_date date,
  approved_date date,
  estimated_hours numeric not null default 0,
  logged_hours numeric not null default 0,
  hourly_rate numeric,
  start_date date,
  completed_date date,
  handover_date date,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

alter table public.project_tasks add column if not exists client_review_date date;

alter table public.project_tasks drop constraint if exists project_tasks_status_check;
alter table public.project_tasks
  add constraint project_tasks_status_check
  check (status in ('Requested', 'Client Review', 'Confirmed', 'Approved', 'Working On It', 'Completed', 'Handover'));

alter table public.project_tasks drop constraint if exists project_tasks_estimated_hours_non_negative;
alter table public.project_tasks
  add constraint project_tasks_estimated_hours_non_negative
  check (estimated_hours >= 0);

alter table public.project_tasks drop constraint if exists project_tasks_logged_hours_non_negative;
alter table public.project_tasks
  add constraint project_tasks_logged_hours_non_negative
  check (logged_hours >= 0);

alter table public.project_tasks drop constraint if exists project_tasks_hourly_rate_non_negative;
alter table public.project_tasks
  add constraint project_tasks_hourly_rate_non_negative
  check (hourly_rate is null or hourly_rate >= 0);

create table if not exists public.task_events (
  id bigserial primary key,
  task_id text not null references public.project_tasks(id) on delete cascade,
  source_event_id text,
  status text not null,
  note text,
  changed_at timestamptz not null,
  event_type text not null default 'status_change',
  created_at timestamptz not null default now()
);

create unique index if not exists ux_task_events_source
  on public.task_events(task_id, source_event_id)
  where source_event_id is not null;

create index if not exists ix_task_events_task_changed_at
  on public.task_events(task_id, changed_at desc);

create table if not exists public.task_hour_revisions (
  id bigserial primary key,
  task_id text not null references public.project_tasks(id) on delete cascade,
  source_revision_id text,
  previous_estimated_hours numeric not null,
  next_estimated_hours numeric not null,
  reason text,
  changed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index if not exists ux_task_hour_revisions_source
  on public.task_hour_revisions(task_id, source_revision_id)
  where source_revision_id is not null;

create index if not exists ix_task_hour_revisions_task_changed_at
  on public.task_hour_revisions(task_id, changed_at desc);

create table if not exists public.app_users (
  id text primary key,
  name text not null,
  email text not null unique,
  role text not null check (role in ('super_user', 'admin', 'client')),
  status text not null check (status in ('pending', 'approved', 'rejected')),
  approved_by_user_id text references public.app_users(id),
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_users drop column if exists password;

alter table public.app_users drop constraint if exists app_users_role_check;
alter table public.app_users
  add constraint app_users_role_check
  check (role in ('super_user', 'admin', 'client'));

create index if not exists ix_app_users_status on public.app_users(status);
create index if not exists ix_app_users_role on public.app_users(role);

create table if not exists public.weekly_plans (
  id text primary key,
  week_start_date date not null,
  week_end_date date not null,
  daily_updates jsonb not null default '[]'::jsonb,
  created_by_user_id text not null references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_plans_week_range check (week_start_date <= week_end_date)
);

alter table public.weekly_plans add column if not exists week_start_date date;
alter table public.weekly_plans add column if not exists week_end_date date;
alter table public.weekly_plans add column if not exists daily_updates jsonb not null default '[]'::jsonb;

-- Remove legacy columns from older weekly planner schema.
alter table public.weekly_plans drop column if exists title;
alter table public.weekly_plans drop column if exists description;
alter table public.weekly_plans drop column if exists notes;
alter table public.weekly_plans drop column if exists objectives;
alter table public.weekly_plans drop column if exists task_feature_name;
alter table public.weekly_plans drop column if exists category_module;
alter table public.weekly_plans drop column if exists context_what;
alter table public.weekly_plans drop column if exists context_why;
alter table public.weekly_plans drop column if exists assigned_to;
alter table public.weekly_plans drop column if exists status;
alter table public.weekly_plans drop column if exists complexity_estimate;
alter table public.weekly_plans drop column if exists sprint_week_no;
alter table public.weekly_plans drop column if exists target_start_date;
alter table public.weekly_plans drop column if exists target_end_date;
alter table public.weekly_plans drop column if exists actual_completion_date;
alter table public.weekly_plans drop column if exists blockers_dependencies;

-- Hard cleanup: keep only supported weekly_plans columns.
do $$
declare
  col record;
begin
  for col in
    select c.column_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'weekly_plans'
      and c.column_name not in (
        'id',
        'week_start_date',
        'week_end_date',
        'daily_updates',
        'created_by_user_id',
        'created_at',
        'updated_at'
      )
  loop
    execute format('alter table public.weekly_plans drop column if exists %I', col.column_name);
  end loop;
end $$;

update public.weekly_plans
set
  week_start_date = coalesce(week_start_date, current_date),
  week_end_date = coalesce(week_end_date, current_date),
  daily_updates = coalesce(daily_updates, '[]'::jsonb)
where true;

alter table public.weekly_plans alter column week_start_date set not null;
alter table public.weekly_plans alter column week_end_date set not null;

alter table public.weekly_plans drop constraint if exists weekly_plans_week_range;
alter table public.weekly_plans
  add constraint weekly_plans_week_range check (week_start_date <= week_end_date);

create index if not exists ix_weekly_plans_week_start on public.weekly_plans(week_start_date desc);

create table if not exists public.weekly_plan_daily_entries (
  id bigserial primary key,
  weekly_plan_id text not null references public.weekly_plans(id) on delete cascade,
  source_update_id text not null,
  entry_date date not null,
  developer_name text not null,
  project_name text,
  work_area text not null check (work_area in ('Frontend', 'Backend', 'QA', 'Frontend + Backend', 'Other')),
  morning_plan text,
  evening_update text,
  spent_hours numeric(6,2) check (spent_hours is null or spent_hours >= 0),
  progress_percent numeric(5,2) check (progress_percent is null or (progress_percent >= 0 and progress_percent <= 100)),
  office_check_in time,
  office_check_out time,
  has_blocker boolean not null default false,
  blocker_details text,
  has_pending_work boolean not null default false,
  pending_work_details text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint weekly_plan_daily_entries_unique_source unique (weekly_plan_id, source_update_id)
);

create index if not exists ix_weekly_plan_daily_entries_plan_date
  on public.weekly_plan_daily_entries(weekly_plan_id, entry_date desc);
create index if not exists ix_weekly_plan_daily_entries_dev_date
  on public.weekly_plan_daily_entries(developer_name, entry_date desc);
create index if not exists ix_weekly_plan_daily_entries_project_date
  on public.weekly_plan_daily_entries(project_name, entry_date desc);
create index if not exists ix_weekly_plan_daily_entries_blocker
  on public.weekly_plan_daily_entries(has_blocker, has_pending_work);

insert into public.weekly_plan_daily_entries (
  weekly_plan_id,
  source_update_id,
  entry_date,
  developer_name,
  project_name,
  work_area,
  morning_plan,
  evening_update,
  spent_hours,
  progress_percent,
  office_check_in,
  office_check_out,
  has_blocker,
  blocker_details,
  has_pending_work,
  pending_work_details,
  updated_at
)
select
  wp.id as weekly_plan_id,
  coalesce(nullif(trim(entry->>'id'), ''), md5(wp.id || '-' || coalesce(entry->>'date', '') || '-' || coalesce(entry->>'developerName', '') || '-' || entry::text)) as source_update_id,
  coalesce(nullif(entry->>'date', '')::date, wp.week_start_date) as entry_date,
  coalesce(nullif(trim(entry->>'developerName'), ''), 'Unknown') as developer_name,
  nullif(trim(entry->>'projectName'), '') as project_name,
  coalesce(nullif(entry->>'workArea', ''), 'Other') as work_area,
  nullif(trim(entry->>'morningPlan'), '') as morning_plan,
  coalesce(
    nullif(trim(entry->>'eveningUpdate'), ''),
    nullif(trim(entry->>'note'), '')
  ) as evening_update,
  case
    when jsonb_typeof(entry->'spentHours') = 'number' then (entry->>'spentHours')::numeric
    else null
  end as spent_hours,
  case
    when jsonb_typeof(entry->'progressPercent') = 'number' then (entry->>'progressPercent')::numeric
    else null
  end as progress_percent,
  case
    when coalesce(entry->>'officeCheckIn', '') ~ '^\d{2}:\d{2}$' then (entry->>'officeCheckIn')::time
    else null
  end as office_check_in,
  case
    when coalesce(entry->>'officeCheckOut', '') ~ '^\d{2}:\d{2}$' then (entry->>'officeCheckOut')::time
    else null
  end as office_check_out,
  case
    when lower(coalesce(entry->>'hasBlocker', '')) in ('true', 'false') then (entry->>'hasBlocker')::boolean
    else false
  end as has_blocker,
  nullif(trim(entry->>'blockerDetails'), '') as blocker_details,
  case
    when lower(coalesce(entry->>'hasPendingWork', '')) in ('true', 'false') then (entry->>'hasPendingWork')::boolean
    else false
  end as has_pending_work,
  nullif(trim(entry->>'pendingWorkDetails'), '') as pending_work_details,
  coalesce(nullif(entry->>'updatedAt', '')::timestamptz, wp.updated_at) as updated_at
from public.weekly_plans wp
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(coalesce(wp.daily_updates, '[]'::jsonb)) = 'array' then coalesce(wp.daily_updates, '[]'::jsonb)
    else '[]'::jsonb
  end
) as entry
on conflict (weekly_plan_id, source_update_id) do nothing;

create table if not exists public.todo_items (
  id text primary key,
  title text not null,
  details text,
  due_date date not null,
  status text not null check (status in ('not_done', 'done')),
  created_by_user_id text not null references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_todo_items_due_date on public.todo_items(due_date asc);
create index if not exists ix_todo_items_status_due_date on public.todo_items(status, due_date asc);
create index if not exists ix_todo_items_owner on public.todo_items(created_by_user_id);

create table if not exists public.task_access_meta (
  task_id text primary key references public.project_tasks(id) on delete cascade,
  owner_user_id text references public.app_users(id),
  approval_status text not null check (approval_status in ('pending', 'approved', 'rejected')),
  decision_note text,
  decided_by_user_id text references public.app_users(id),
  decided_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists ix_task_access_meta_owner on public.task_access_meta(owner_user_id);
create index if not exists ix_task_access_meta_approval on public.task_access_meta(approval_status);

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------

create or replace function public.app_current_user_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.id
  from public.app_users u
  where lower(u.email) = lower(coalesce(auth.jwt()->>'email', ''))
  limit 1;
$$;

create or replace function public.app_is_super_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users u
    where lower(u.email) = lower(coalesce(auth.jwt()->>'email', ''))
      and u.status = 'approved'
      and u.role = 'super_user'
  );
$$;

create or replace function public.app_is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users u
    where lower(u.email) = lower(coalesce(auth.jwt()->>'email', ''))
      and u.status = 'approved'
      and u.role in ('super_user', 'admin')
  );
$$;

create or replace function public.app_can_view_task(p_task_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.app_is_manager()
    or exists (
      select 1
      from public.task_access_meta m
      where m.task_id = p_task_id
        and m.owner_user_id = public.app_current_user_id()
    );
$$;

create or replace function public.app_can_write_task(p_task_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.app_is_manager()
    or exists (
      select 1
      from public.task_access_meta m
      where m.task_id = p_task_id
        and m.owner_user_id = public.app_current_user_id()
    );
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------

alter table public.project_tasks enable row level security;
alter table public.task_events enable row level security;
alter table public.task_hour_revisions enable row level security;
alter table public.app_users enable row level security;
alter table public.weekly_plans enable row level security;
alter table public.weekly_plan_daily_entries enable row level security;
alter table public.todo_items enable row level security;
alter table public.task_access_meta enable row level security;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

drop policy if exists "project tasks select" on public.project_tasks;
create policy "project tasks select" on public.project_tasks
for select to authenticated
using (public.app_can_view_task(id));

drop policy if exists "project tasks insert" on public.project_tasks;
create policy "project tasks insert" on public.project_tasks
for insert to authenticated
with check (public.app_current_user_id() is not null);

drop policy if exists "project tasks update" on public.project_tasks;
create policy "project tasks update" on public.project_tasks
for update to authenticated
using (public.app_can_write_task(id))
with check (public.app_can_write_task(id));

drop policy if exists "project tasks delete" on public.project_tasks;
create policy "project tasks delete" on public.project_tasks
for delete to authenticated
using (public.app_is_super_user());

drop policy if exists "task events select" on public.task_events;
create policy "task events select" on public.task_events
for select to authenticated
using (public.app_can_view_task(task_id));

drop policy if exists "task events insert" on public.task_events;
create policy "task events insert" on public.task_events
for insert to authenticated
with check (public.app_can_write_task(task_id));

drop policy if exists "task events update" on public.task_events;
create policy "task events update" on public.task_events
for update to authenticated
using (public.app_can_write_task(task_id))
with check (public.app_can_write_task(task_id));

drop policy if exists "task events delete" on public.task_events;
create policy "task events delete" on public.task_events
for delete to authenticated
using (public.app_is_super_user());

drop policy if exists "task hour revisions select" on public.task_hour_revisions;
create policy "task hour revisions select" on public.task_hour_revisions
for select to authenticated
using (public.app_can_view_task(task_id));

drop policy if exists "task hour revisions insert" on public.task_hour_revisions;
create policy "task hour revisions insert" on public.task_hour_revisions
for insert to authenticated
with check (public.app_can_write_task(task_id));

drop policy if exists "task hour revisions update" on public.task_hour_revisions;
create policy "task hour revisions update" on public.task_hour_revisions
for update to authenticated
using (public.app_can_write_task(task_id))
with check (public.app_can_write_task(task_id));

drop policy if exists "task hour revisions delete" on public.task_hour_revisions;
create policy "task hour revisions delete" on public.task_hour_revisions
for delete to authenticated
using (public.app_is_super_user());

drop policy if exists "app users select" on public.app_users;
create policy "app users select" on public.app_users
for select to authenticated
using (
  public.app_is_super_user()
  or id = public.app_current_user_id()
);

drop policy if exists "app users insert" on public.app_users;
create policy "app users insert" on public.app_users
for insert to authenticated
with check (lower(email) = lower(coalesce(auth.jwt()->>'email', '')));

drop policy if exists "app users update" on public.app_users;
create policy "app users update" on public.app_users
for update to authenticated
using (public.app_is_super_user())
with check (public.app_is_super_user());

drop policy if exists "app users delete" on public.app_users;
create policy "app users delete" on public.app_users
for delete to authenticated
using (public.app_is_super_user());

drop policy if exists "weekly plans select" on public.weekly_plans;
create policy "weekly plans select" on public.weekly_plans
for select to authenticated
using (public.app_is_super_user());

drop policy if exists "weekly plans insert" on public.weekly_plans;
create policy "weekly plans insert" on public.weekly_plans
for insert to authenticated
with check (public.app_is_super_user());

drop policy if exists "weekly plans update" on public.weekly_plans;
create policy "weekly plans update" on public.weekly_plans
for update to authenticated
using (public.app_is_super_user())
with check (public.app_is_super_user());

drop policy if exists "weekly plans delete" on public.weekly_plans;
create policy "weekly plans delete" on public.weekly_plans
for delete to authenticated
using (public.app_is_super_user());

drop policy if exists "weekly plan entries select" on public.weekly_plan_daily_entries;
create policy "weekly plan entries select" on public.weekly_plan_daily_entries
for select to authenticated
using (public.app_is_super_user());

drop policy if exists "weekly plan entries insert" on public.weekly_plan_daily_entries;
create policy "weekly plan entries insert" on public.weekly_plan_daily_entries
for insert to authenticated
with check (public.app_is_super_user());

drop policy if exists "weekly plan entries update" on public.weekly_plan_daily_entries;
create policy "weekly plan entries update" on public.weekly_plan_daily_entries
for update to authenticated
using (public.app_is_super_user())
with check (public.app_is_super_user());

drop policy if exists "weekly plan entries delete" on public.weekly_plan_daily_entries;
create policy "weekly plan entries delete" on public.weekly_plan_daily_entries
for delete to authenticated
using (public.app_is_super_user());

drop policy if exists "todo items select" on public.todo_items;
create policy "todo items select" on public.todo_items
for select to authenticated
using (
  created_by_user_id = public.app_current_user_id()
  or public.app_is_manager()
);

drop policy if exists "todo items insert" on public.todo_items;
create policy "todo items insert" on public.todo_items
for insert to authenticated
with check (
  created_by_user_id = public.app_current_user_id()
  or public.app_is_manager()
);

drop policy if exists "todo items update" on public.todo_items;
create policy "todo items update" on public.todo_items
for update to authenticated
using (
  created_by_user_id = public.app_current_user_id()
  or public.app_is_manager()
)
with check (
  created_by_user_id = public.app_current_user_id()
  or public.app_is_manager()
);

drop policy if exists "todo items delete" on public.todo_items;
create policy "todo items delete" on public.todo_items
for delete to authenticated
using (
  created_by_user_id = public.app_current_user_id()
  or public.app_is_manager()
);

drop policy if exists "task access meta select" on public.task_access_meta;
create policy "task access meta select" on public.task_access_meta
for select to authenticated
using (
  public.app_is_manager()
  or owner_user_id = public.app_current_user_id()
);

drop policy if exists "task access meta insert" on public.task_access_meta;
create policy "task access meta insert" on public.task_access_meta
for insert to authenticated
with check (
  public.app_is_manager()
  or owner_user_id = public.app_current_user_id()
);

drop policy if exists "task access meta update" on public.task_access_meta;
create policy "task access meta update" on public.task_access_meta
for update to authenticated
using (
  public.app_is_manager()
  or owner_user_id = public.app_current_user_id()
)
with check (
  public.app_is_manager()
  or owner_user_id = public.app_current_user_id()
);

drop policy if exists "task access meta delete" on public.task_access_meta;
create policy "task access meta delete" on public.task_access_meta
for delete to authenticated
using (public.app_is_super_user());

-- ---------------------------------------------------------------------------
-- Auth -> app_users sync
-- ---------------------------------------------------------------------------

create or replace function public.sync_app_user_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  role_raw text;
  role_value text;
  status_value text;
  profile_name text;
begin
  role_raw := lower(coalesce(new.raw_user_meta_data->>'role', 'client'));
  if role_raw in ('super_user', 'admin', 'client') then
    role_value := role_raw;
  else
    role_value := 'client';
  end if;

  status_value := 'pending';
  if role_value = 'super_user' and lower(coalesce(new.email, '')) = 'abdullahalnomancse@gmail.com' then
    status_value := 'approved';
  end if;

  profile_name := nullif(trim(coalesce(new.raw_user_meta_data->>'name', '')), '');
  if profile_name is null then
    profile_name := split_part(coalesce(new.email, ''), '@', 1);
  end if;

  insert into public.app_users (
    id,
    name,
    email,
    role,
    status,
    approved_by_user_id,
    approved_at,
    rejection_reason,
    created_at,
    updated_at
  )
  values (
    new.id::text,
    profile_name,
    lower(coalesce(new.email, '')),
    role_value,
    status_value,
    null,
    case when status_value = 'approved' then now() else null end,
    null,
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (email) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_sync_app_user_from_auth on auth.users;
create trigger trg_sync_app_user_from_auth
after insert on auth.users
for each row execute function public.sync_app_user_from_auth();

-- ---------------------------------------------------------------------------
-- Legacy migrations
-- ---------------------------------------------------------------------------

-- project_tracker_state.tasks (json array) -> project_tasks rows
DO $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'project_tracker_state'
  ) then
    insert into public.project_tasks (
      id, title, description, change_points, requested_date, client_name, status,
      eta_date, delivery_date, client_review_date, confirmed_date, approved_date,
      estimated_hours, logged_hours, hourly_rate,
      start_date, completed_date, handover_date,
      created_at, updated_at
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
      nullif(task->>'clientReviewDate', '')::date,
      nullif(task->>'confirmedDate', '')::date,
      nullif(task->>'approvedDate', '')::date,
      coalesce((task->>'estimatedHours')::numeric, 0),
      coalesce((task->>'loggedHours')::numeric, 0),
      nullif(task->>'hourlyRate', '')::numeric,
      nullif(task->>'startDate', '')::date,
      nullif(task->>'completedDate', '')::date,
      nullif(task->>'handoverDate', '')::date,
      coalesce((task->>'createdAt')::timestamptz, now()),
      coalesce((task->>'updatedAt')::timestamptz, now())
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
      client_review_date = excluded.client_review_date,
      confirmed_date = excluded.confirmed_date,
      approved_date = excluded.approved_date,
      estimated_hours = excluded.estimated_hours,
      logged_hours = excluded.logged_hours,
      hourly_rate = excluded.hourly_rate,
      start_date = excluded.start_date,
      completed_date = excluded.completed_date,
      handover_date = excluded.handover_date,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at;
  end if;
end $$;

-- Migrate legacy json columns from project_tasks (if present)
DO $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'project_tasks' and column_name = 'history'
  ) then
    execute '
      insert into public.task_events (task_id, source_event_id, status, note, changed_at, event_type)
      select
        t.id,
        h->>''id'',
        coalesce(h->>''status'', t.status),
        nullif(h->>''note'', ''''),
        coalesce((h->>''changedAt'')::timestamptz, t.updated_at),
        case when lower(coalesce(h->>''note'','''')) like ''%rollback%'' then ''rollback'' else ''status_change'' end
      from public.project_tasks t,
      lateral jsonb_array_elements(coalesce(t.history, ''[]''::jsonb)) as h
      where coalesce(h->>''id'', '''') <> ''''
      on conflict do nothing
    ';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'project_tasks' and column_name = 'hour_revisions'
  ) then
    execute '
      insert into public.task_hour_revisions (
        task_id, source_revision_id, previous_estimated_hours, next_estimated_hours, reason, changed_at
      )
      select
        t.id,
        r->>''id'',
        coalesce((r->>''previousEstimatedHours'')::numeric, 0),
        coalesce((r->>''nextEstimatedHours'')::numeric, 0),
        nullif(r->>''reason'', ''''),
        coalesce((r->>''changedAt'')::timestamptz, t.updated_at)
      from public.project_tasks t,
      lateral jsonb_array_elements(coalesce(t.hour_revisions, ''[]''::jsonb)) as r
      where coalesce(r->>''id'', '''') <> ''''
      on conflict do nothing
    ';
  end if;
end $$;

-- Keep project_tasks as current-state only
alter table public.project_tasks drop column if exists history;
alter table public.project_tasks drop column if exists hour_revisions;

commit;
