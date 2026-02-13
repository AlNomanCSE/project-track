import { STATUSES, type ProjectTask, type TaskStatus } from "@/lib/types";

const STORAGE_KEY = "project-tracker-agent-v1";

type TaskRepository = {
  read: () => ProjectTask[];
  write: (tasks: ProjectTask[]) => void;
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

const normalizeTask = (rawTask: unknown): ProjectTask | null => {
  if (!isObject(rawTask)) return null;

  const nowIso = new Date().toISOString();
  const id = safeString(rawTask.id) || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const title = safeString(rawTask.title).trim();
  if (!title) return null;

  const history = Array.isArray(rawTask.history)
    ? rawTask.history.filter(isObject).map((item, idx) => ({
        id: safeString(item.id) || `${id}-h-${idx}`,
        status: isStatus(item.status) ? item.status : "Requested",
        changedAt: safeString(item.changedAt) || nowIso,
        note: safeString(item.note) || undefined
      }))
    : [];

  const hourRevisions = Array.isArray(rawTask.hourRevisions)
    ? rawTask.hourRevisions.filter(isObject).map((entry, idx) => ({
        id: safeString(entry.id) || `${id}-r-${idx}`,
        previousEstimatedHours: numberOrDefault(entry.previousEstimatedHours, 0),
        nextEstimatedHours: numberOrDefault(entry.nextEstimatedHours, 0),
        changedAt: safeString(entry.changedAt) || nowIso,
        reason: safeString(entry.reason) || undefined
      }))
    : [];

  const changePoints = Array.isArray(rawTask.changePoints)
    ? rawTask.changePoints
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  const legacyDescription = safeString(rawTask.description).trim();
  const normalizedPoints = changePoints.length > 0 ? changePoints : legacyDescription ? [legacyDescription] : [];

  return {
    id,
    title,
    description: legacyDescription,
    changePoints: normalizedPoints,
    requestedDate: safeString(rawTask.requestedDate, nowIso.slice(0, 10)),
    clientName: safeString(rawTask.clientName) || undefined,
    status: isStatus(rawTask.status) ? rawTask.status : "Requested",
    etaDate: safeString(rawTask.etaDate) || undefined,
    deliveryDate: safeString(rawTask.deliveryDate) || undefined,
    confirmedDate: safeString(rawTask.confirmedDate) || undefined,
    approvedDate: safeString(rawTask.approvedDate) || undefined,
    estimatedHours: numberOrDefault(rawTask.estimatedHours, 0),
    loggedHours: numberOrDefault(rawTask.loggedHours, 0),
    hourlyRate: rawTask.hourlyRate === undefined ? undefined : numberOrDefault(rawTask.hourlyRate, 0),
    startDate: safeString(rawTask.startDate) || undefined,
    completedDate: safeString(rawTask.completedDate) || undefined,
    handoverDate: safeString(rawTask.handoverDate) || undefined,
    createdAt: safeString(rawTask.createdAt) || nowIso,
    updatedAt: safeString(rawTask.updatedAt) || nowIso,
    history,
    hourRevisions
  };
};

class LocalStorageRepository implements TaskRepository {
  read(): ProjectTask[] {
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

  write(tasks: ProjectTask[]) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }
}

export const taskRepository: TaskRepository = new LocalStorageRepository();

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
