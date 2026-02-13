# Project Tracker Agent (Local-First)

This is a local-first Next.js app for managing project change requests and client workflow status.

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
- Approx delivery date (ETA) per request
- Estimated hours, logged hours, and remaining hours
- Optional hourly rate and estimated cost view
- Re-estimation reason and history log
- Status update history timeline
- Local storage persistence (no backend)
- JSON export/import for backup and transfer

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Future backend migration

Current data layer is in `lib/storage.ts` as a `TaskRepository` abstraction.
You can later replace `LocalStorageRepository` with API calls without rewriting UI logic.
