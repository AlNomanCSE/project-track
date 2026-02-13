# Project Tracker Agent (Supabase Connected)

This is a Next.js app for managing project change requests and client workflow status.
Data is stored in Supabase with localStorage fallback.

## Workflow statuses

- Requested
- Client Review
- Confirmed
- Approved
- Working On It
- Completed
- Handover

## Key features

- Date-wise request tracking
- Filter by status, date range, and keyword
- Estimated hours, logged hours, and remaining hours
- Optional hourly rate and estimated cost view
- Re-estimation reason and history log
- Status update history timeline
- Supabase persistence with local fallback
- JSON export/import for backup and transfer

## Environment

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Supabase table setup

Run the SQL in `/supabase/schema.sql` inside Supabase SQL Editor.

It sets up this normalized structure:
- `public.project_tasks` (current task state, one row per task)
- `public.task_events` (status changes, notes, rollback reason)
- `public.task_hour_revisions` (estimate change history and reason)
- `public.app_users` (super_user/admin/client registrations and approval status)
- `public.task_access_meta` (task owner + admin approval state)

If old snapshot data exists in `project_tracker_state` or old JSON columns exist in `project_tasks`,
the SQL migrates them automatically.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Notes

- Current RLS policies in `supabase/schema.sql` require authenticated access.
- Super user access is role-based (`role = 'super_user'`).
- Only super user can approve/reject users, approve/reject tasks, and delete admin/client users.
- Super user management page: `/super/users`.
