import { supabase } from "@/lib/supabase";
import { STATUSES, type ProjectTask, type TaskStatus } from "@/lib/types";

const STORAGE_KEY = "project-tracker-agent-v1";
const SUPABASE_TASKS_TABLE = "project_tasks";

type TaskRepository = {
  read: () => Promise<ProjectTask[]>;
  write: (tasks: ProjectTask[]) => Promise<void>;
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
  history: unknown;
  hour_revisions: unknown;
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
  confirmed_date: task.confirmedDate ?? null,
  approved_date: task.approvedDate ?? null,
  estimated_hours: task.estimatedHours,
  logged_hours: task.loggedHours,
  hourly_rate: task.hourlyRate ?? null,
  start_date: task.startDate ?? null,
  completed_date: task.completedDate ?? null,
  handover_date: task.handoverDate ?? null,
  created_at: task.createdAt,
  updated_at: task.updatedAt,
  history: task.history,
  hour_revisions: task.hourRevisions
});

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
}

class SupabaseTaskRepository implements TaskRepository {
  constructor(private readonly fallback: TaskRepository) {}

  async read(): Promise<ProjectTask[]> {
    const local = await this.fallback.read();
    if (!supabase) return local;

    const { data, error } = await supabase
      .from(SUPABASE_TASKS_TABLE)
      .select("*")
      .order("requested_date", { ascending: false });

    if (error) {
      console.warn("Supabase read failed, using local data:", error.message);
      return local;
    }

    const normalized = (data ?? []).map(normalizeTask).filter((task): task is ProjectTask => task !== null);
    await this.fallback.write(normalized);
    return normalized;
  }

  async write(tasks: ProjectTask[]): Promise<void> {
    await this.fallback.write(tasks);
    if (!supabase) return;

    const rows = tasks.map(taskToDbRow);

    const { error: upsertError } = await supabase
      .from(SUPABASE_TASKS_TABLE)
      .upsert(rows, { onConflict: "id" });

    if (upsertError) {
      console.warn("Supabase write failed, local data kept:", upsertError.message);
      return;
    }

    const { data: existingRows, error: existingError } = await supabase
      .from(SUPABASE_TASKS_TABLE)
      .select("id");

    if (existingError) {
      console.warn("Supabase cleanup read failed:", existingError.message);
      return;
    }

    const nextIds = new Set(tasks.map((task) => task.id));
    const toDelete = (existingRows ?? [])
      .map((row) => row.id)
      .filter((id) => !nextIds.has(id));

    if (toDelete.length === 0) return;

    const { error: deleteError } = await supabase
      .from(SUPABASE_TASKS_TABLE)
      .delete()
      .in("id", toDelete);

    if (deleteError) {
      console.warn("Supabase delete sync failed:", deleteError.message);
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
