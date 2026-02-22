import { supabase } from "@/lib/supabase";
import { STATUSES, type ProjectTask, type TaskStatus } from "@/lib/types";

const STORAGE_KEY = "project-tracker-agent-v1";
const SUPABASE_TASKS_TABLE = "project_tasks";
const SUPABASE_EVENTS_TABLE = "task_events";
const SUPABASE_REVISIONS_TABLE = "task_hour_revisions";

type TaskRepository = {
  read: () => Promise<ProjectTask[]>;
  write: (tasks: ProjectTask[]) => Promise<void>;
  writeDelta: (previous: ProjectTask[], next: ProjectTask[]) => Promise<void>;
};

type DbTaskRow = {
  id: string;
  title: string;
  description: string;
  change_points: unknown;
  requested_date: string;
  client_name: string | null;
  status: string;
  eta_date: string | null;
  delivery_date: string | null;
  client_review_date: string | null;
  confirmed_date: string | null;
  approved_date: string | null;
  estimated_hours: number;
  logged_hours: number;
  hourly_rate: number | null;
  start_date: string | null;
  completed_date: string | null;
  handover_date: string | null;
  created_at: string;
  updated_at: string;
};

type DbEventRow = {
  id: number;
  task_id: string;
  source_event_id: string | null;
  status: string;
  note: string | null;
  changed_at: string;
};

type DbRevisionRow = {
  id: number;
  task_id: string;
  source_revision_id: string | null;
  previous_estimated_hours: number;
  next_estimated_hours: number;
  reason: string | null;
  changed_at: string;
};

const numberOrDefault = (value: unknown, fallback: number): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const isStatus = (value: unknown): value is TaskStatus => {
  return typeof value === "string" && STATUSES.includes(value as TaskStatus);
};

const safeString = (value: unknown, fallback = ""): string => {
  return typeof value === "string" ? value : fallback;
};

const pickString = (raw: Record<string, unknown>, keys: string[], fallback = ""): string => {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string") return value;
  }
  return fallback;
};

const pickOptionalString = (raw: Record<string, unknown>, keys: string[]): string | undefined => {
  const value = pickString(raw, keys, "").trim();
  return value || undefined;
};

const normalizeTask = (rawTask: unknown): ProjectTask | null => {
  if (!isObject(rawTask)) return null;

  const nowIso = new Date().toISOString();
  const id = pickString(rawTask, ["id"]) || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const title = pickString(rawTask, ["title"]).trim();
  if (!title) return null;

  const historyRaw = rawTask.history;
  const history = Array.isArray(historyRaw)
    ? historyRaw.filter(isObject).map((item, idx) => ({
        id: safeString(item.id) || `${id}-h-${idx}`,
        status: isStatus(item.status) ? item.status : "Requested",
        changedAt: safeString(item.changedAt) || nowIso,
        note: safeString(item.note) || undefined
      }))
    : [];

  const hourRevisionsRaw = rawTask.hourRevisions ?? rawTask.hour_revisions;
  const hourRevisions = Array.isArray(hourRevisionsRaw)
    ? hourRevisionsRaw.filter(isObject).map((entry, idx) => ({
        id: safeString(entry.id) || `${id}-r-${idx}`,
        previousEstimatedHours: numberOrDefault(entry.previousEstimatedHours, 0),
        nextEstimatedHours: numberOrDefault(entry.nextEstimatedHours, 0),
        changedAt: safeString(entry.changedAt) || nowIso,
        reason: safeString(entry.reason) || undefined
      }))
    : [];

  const changePointsRaw = rawTask.changePoints ?? rawTask.change_points;
  const changePoints = Array.isArray(changePointsRaw)
    ? changePointsRaw
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  const legacyDescription = pickString(rawTask, ["description"]).trim();
  const normalizedPoints = changePoints.length > 0 ? changePoints : legacyDescription ? [legacyDescription] : [];

  const requestedDate = pickString(rawTask, ["requestedDate", "requested_date"], nowIso.slice(0, 10));

  return {
    id,
    title,
    description: legacyDescription,
    changePoints: normalizedPoints,
    requestedDate,
    clientName: pickOptionalString(rawTask, ["clientName", "client_name"]),
    status: isStatus(rawTask.status) ? rawTask.status : "Requested",
    etaDate: pickOptionalString(rawTask, ["etaDate", "eta_date"]),
    deliveryDate: pickOptionalString(rawTask, ["deliveryDate", "delivery_date"]),
    clientReviewDate: pickOptionalString(rawTask, ["clientReviewDate", "client_review_date"]),
    confirmedDate: pickOptionalString(rawTask, ["confirmedDate", "confirmed_date"]),
    approvedDate: pickOptionalString(rawTask, ["approvedDate", "approved_date"]),
    estimatedHours: numberOrDefault(rawTask.estimatedHours ?? rawTask.estimated_hours, 0),
    loggedHours: numberOrDefault(rawTask.loggedHours ?? rawTask.logged_hours, 0),
    hourlyRate:
      rawTask.hourlyRate === undefined && rawTask.hourly_rate === undefined
        ? undefined
        : numberOrDefault(rawTask.hourlyRate ?? rawTask.hourly_rate, 0),
    startDate: pickOptionalString(rawTask, ["startDate", "start_date"]),
    completedDate: pickOptionalString(rawTask, ["completedDate", "completed_date"]),
    handoverDate: pickOptionalString(rawTask, ["handoverDate", "handover_date"]),
    createdAt: pickString(rawTask, ["createdAt", "created_at"], nowIso),
    updatedAt: pickString(rawTask, ["updatedAt", "updated_at"], nowIso),
    history,
    hourRevisions
  };
};

const taskToDbRow = (task: ProjectTask): DbTaskRow => ({
  id: task.id,
  title: task.title,
  description: task.description,
  change_points: task.changePoints,
  requested_date: task.requestedDate,
  client_name: task.clientName ?? null,
  status: task.status,
  eta_date: task.etaDate ?? null,
  delivery_date: task.deliveryDate ?? null,
  client_review_date: task.clientReviewDate ?? null,
  confirmed_date: task.confirmedDate ?? null,
  approved_date: task.approvedDate ?? null,
  estimated_hours: task.estimatedHours,
  logged_hours: task.loggedHours,
  hourly_rate: task.hourlyRate ?? null,
  start_date: task.startDate ?? null,
  completed_date: task.completedDate ?? null,
  handover_date: task.handoverDate ?? null,
  created_at: task.createdAt,
  updated_at: task.updatedAt
});

const taskToDbUpdate = (task: ProjectTask): Omit<DbTaskRow, "id" | "created_at"> => ({
  title: task.title,
  description: task.description,
  change_points: task.changePoints,
  requested_date: task.requestedDate,
  client_name: task.clientName ?? null,
  status: task.status,
  eta_date: task.etaDate ?? null,
  delivery_date: task.deliveryDate ?? null,
  client_review_date: task.clientReviewDate ?? null,
  confirmed_date: task.confirmedDate ?? null,
  approved_date: task.approvedDate ?? null,
  estimated_hours: task.estimatedHours,
  logged_hours: task.loggedHours,
  hourly_rate: task.hourlyRate ?? null,
  start_date: task.startDate ?? null,
  completed_date: task.completedDate ?? null,
  handover_date: task.handoverDate ?? null,
  updated_at: task.updatedAt
});

function taskHasChanged(previous: ProjectTask | undefined, next: ProjectTask): boolean {
  if (!previous) return true;
  return (
    previous.updatedAt !== next.updatedAt ||
    previous.status !== next.status ||
    previous.title !== next.title ||
    previous.description !== next.description ||
    previous.requestedDate !== next.requestedDate ||
    previous.clientName !== next.clientName ||
    previous.estimatedHours !== next.estimatedHours ||
    previous.loggedHours !== next.loggedHours ||
    previous.hourlyRate !== next.hourlyRate ||
    previous.deliveryDate !== next.deliveryDate ||
    previous.clientReviewDate !== next.clientReviewDate ||
    previous.startDate !== next.startDate ||
    previous.confirmedDate !== next.confirmedDate ||
    previous.approvedDate !== next.approvedDate ||
    previous.completedDate !== next.completedDate ||
    previous.handoverDate !== next.handoverDate ||
    previous.history.length !== next.history.length ||
    previous.hourRevisions.length !== next.hourRevisions.length
  );
}

class LocalStorageRepository implements TaskRepository {
  async read(): Promise<ProjectTask[]> {
    if (typeof window === "undefined") return [];

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normalizeTask).filter((task): task is ProjectTask => task !== null);
    } catch {
      return [];
    }
  }

  async write(tasks: ProjectTask[]) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }

  async writeDelta(_previous: ProjectTask[], next: ProjectTask[]) {
    await this.write(next);
  }
}

class SupabaseTaskRepository implements TaskRepository {
  constructor(private readonly fallback: TaskRepository) {}

  async read(): Promise<ProjectTask[]> {
    const local = await this.fallback.read();
    if (!supabase) return local;

    const { data: taskRows, error: taskError } = await supabase
      .from(SUPABASE_TASKS_TABLE)
      .select("*")
      .order("requested_date", { ascending: false });

    if (taskError) {
      console.warn("Supabase task read failed, using local data:", taskError.message);
      return local;
    }

    const tasks = (taskRows ?? []) as DbTaskRow[];
    if (tasks.length === 0) {
      // For guest/anon access, Supabase may return no rows due to RLS.
      // Preserve any local cache instead of wiping it, so public read-only view can still render.
      if (local.length > 0) return local;
      await this.fallback.write([]);
      return [];
    }

    const taskIds = tasks.map((task) => task.id);

    const [{ data: eventRows, error: eventError }, { data: revisionRows, error: revisionError }] = await Promise.all([
      supabase
        .from(SUPABASE_EVENTS_TABLE)
        .select("id, task_id, source_event_id, status, note, changed_at")
        .in("task_id", taskIds)
        .order("changed_at", { ascending: true }),
      supabase
        .from(SUPABASE_REVISIONS_TABLE)
        .select("id, task_id, source_revision_id, previous_estimated_hours, next_estimated_hours, reason, changed_at")
        .in("task_id", taskIds)
        .order("changed_at", { ascending: true })
    ]);

    if (eventError || revisionError) {
      console.warn(
        "Supabase related history read failed, using local data:",
        eventError?.message || revisionError?.message || "unknown"
      );
      return local;
    }

    const eventsByTask = new Map<string, DbEventRow[]>();
    for (const event of ((eventRows ?? []) as DbEventRow[])) {
      const list = eventsByTask.get(event.task_id) ?? [];
      list.push(event);
      eventsByTask.set(event.task_id, list);
    }

    const revisionsByTask = new Map<string, DbRevisionRow[]>();
    for (const revision of ((revisionRows ?? []) as DbRevisionRow[])) {
      const list = revisionsByTask.get(revision.task_id) ?? [];
      list.push(revision);
      revisionsByTask.set(revision.task_id, list);
    }

    const normalized = tasks
      .map((task) => {
        const raw = {
          ...task,
          history: (eventsByTask.get(task.id) ?? []).map((event) => ({
            id: event.source_event_id || `${task.id}-event-${event.id}`,
            status: event.status,
            note: event.note || undefined,
            changedAt: event.changed_at
          })),
          hourRevisions: (revisionsByTask.get(task.id) ?? []).map((revision) => ({
            id: revision.source_revision_id || `${task.id}-rev-${revision.id}`,
            previousEstimatedHours: revision.previous_estimated_hours,
            nextEstimatedHours: revision.next_estimated_hours,
            reason: revision.reason || undefined,
            changedAt: revision.changed_at
          }))
        };
        return normalizeTask(raw);
      })
      .filter((task): task is ProjectTask => task !== null);

    await this.fallback.write(normalized);
    return normalized;
  }

  async write(tasks: ProjectTask[]): Promise<void> {
    const previous = await this.fallback.read();
    await this.writeDelta(previous, tasks);
  }

  async writeDelta(previous: ProjectTask[], next: ProjectTask[]): Promise<void> {
    await this.fallback.write(next);
    if (!supabase) return;

    const previousById = new Map(previous.map((task) => [task.id, task]));
    const nextById = new Map(next.map((task) => [task.id, task]));
    const changedTasks = next.filter((task) => taskHasChanged(previousById.get(task.id), task));
    const removedTaskIds = previous
      .map((task) => task.id)
      .filter((taskId) => !nextById.has(taskId));

    const syncedTaskIds = new Set<string>();

    for (const task of changedTasks) {
      const previousTask = previousById.get(task.id);

      if (!previousTask) {
        const { error: insertTaskError } = await supabase
          .from(SUPABASE_TASKS_TABLE)
          .insert(taskToDbRow(task));

        if (insertTaskError) {
          console.warn(`Supabase task insert failed for ${task.id}:`, insertTaskError.message);
          continue;
        }

        syncedTaskIds.add(task.id);
        continue;
      }

      const { data: updatedRow, error: updateTaskError } = await supabase
        .from(SUPABASE_TASKS_TABLE)
        .update(taskToDbUpdate(task))
        .eq("id", task.id)
        .eq("updated_at", previousTask.updatedAt)
        .select("id")
        .maybeSingle();

      if (updateTaskError) {
        console.warn(`Supabase task update failed for ${task.id}:`, updateTaskError.message);
        continue;
      }

      if (!updatedRow) {
        console.warn(`Supabase task update skipped due to concurrent change for ${task.id}.`);
        continue;
      }

      syncedTaskIds.add(task.id);
    }

    if (removedTaskIds.length > 0) {
      const { error: deleteTaskError } = await supabase
        .from(SUPABASE_TASKS_TABLE)
        .delete()
        .in("id", removedTaskIds);

      if (deleteTaskError) {
        console.warn("Supabase task delete sync failed:", deleteTaskError.message);
      }
    }

    if (syncedTaskIds.size === 0) return;

    const eventRows = changedTasks.flatMap((task) => {
      if (!syncedTaskIds.has(task.id)) return [];

      const previousHistoryIds = new Set((previousById.get(task.id)?.history ?? []).map((entry) => entry.id));
      return task.history
        .filter((entry) => !previousHistoryIds.has(entry.id))
        .map((event) => ({
          task_id: task.id,
          source_event_id: event.id,
          status: event.status,
          note: event.note ?? null,
          changed_at: event.changedAt,
          event_type: event.note?.toLowerCase().includes("rollback") ? "rollback" : "status_change"
        }));
    });

    if (eventRows.length > 0) {
      const { error: upsertEventsError } = await supabase
        .from(SUPABASE_EVENTS_TABLE)
        .upsert(eventRows, { onConflict: "task_id,source_event_id" });
      if (upsertEventsError) {
        console.warn("Supabase event upsert failed:", upsertEventsError.message);
      }
    }

    const revisionRows = changedTasks.flatMap((task) => {
      if (!syncedTaskIds.has(task.id)) return [];

      const previousRevisionIds = new Set((previousById.get(task.id)?.hourRevisions ?? []).map((entry) => entry.id));
      return task.hourRevisions
        .filter((entry) => !previousRevisionIds.has(entry.id))
        .map((revision) => ({
          task_id: task.id,
          source_revision_id: revision.id,
          previous_estimated_hours: revision.previousEstimatedHours,
          next_estimated_hours: revision.nextEstimatedHours,
          reason: revision.reason ?? null,
          changed_at: revision.changedAt
        }));
    });

    if (revisionRows.length > 0) {
      const { error: upsertRevisionsError } = await supabase
        .from(SUPABASE_REVISIONS_TABLE)
        .upsert(revisionRows, { onConflict: "task_id,source_revision_id" });
      if (upsertRevisionsError) {
        console.warn("Supabase revision upsert failed:", upsertRevisionsError.message);
      }
    }
  }
}

export const taskRepository: TaskRepository = new SupabaseTaskRepository(new LocalStorageRepository());

export function exportTasks(tasks: ProjectTask[]) {
  return JSON.stringify(tasks, null, 2);
}

export function importTasks(raw: string): ProjectTask[] {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("Invalid JSON format. Expected a task array.");
  }

  const normalized = parsed.map(normalizeTask).filter((task): task is ProjectTask => task !== null);
  if (normalized.length === 0 && parsed.length > 0) {
    throw new Error("No valid tasks found in imported JSON.");
  }

  return normalized;
}
