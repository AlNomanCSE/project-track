import type { ProjectTask } from "@/lib/types";

const CLOSED_STATUSES = new Set(["Completed", "Handover"]);

export function isClosedTask(task: ProjectTask): boolean {
  return CLOSED_STATUSES.has(task.status);
}

export function getTaskPendingHours(task: ProjectTask): number {
  if (isClosedTask(task)) return 0;
  return Math.max(task.estimatedHours - task.loggedHours, 0);
}

export function getTaskTotalHours(task: ProjectTask): number {
  if (isClosedTask(task)) {
    return Math.max(task.loggedHours, task.estimatedHours);
  }
  return task.loggedHours;
}
