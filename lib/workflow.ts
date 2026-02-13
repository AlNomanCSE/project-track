import { STATUSES, type ProjectTask, type TaskStatus } from "@/lib/types";

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  const fromIndex = STATUSES.indexOf(from);
  const toIndex = STATUSES.indexOf(to);
  return toIndex >= fromIndex;
}

export function applyStatusMetadata(task: ProjectTask, nextStatus: TaskStatus, statusDate?: string): ProjectTask {
  const nowDate = new Date().toISOString().slice(0, 10);
  const effectiveDate = statusDate || nowDate;

  if (nextStatus === "Working On It") {
    task.startDate = effectiveDate;
  }

  if (nextStatus === "Confirmed") {
    task.confirmedDate = effectiveDate;
  }

  if (nextStatus === "Approved") {
    task.approvedDate = effectiveDate;
  }

  if (nextStatus === "Completed") {
    task.completedDate = effectiveDate;
  }

  if (nextStatus === "Handover") {
    task.handoverDate = effectiveDate;
  }

  return task;
}

export function filterTasks(tasks: ProjectTask[], filters: { status: string; fromDate?: string; toDate?: string; query?: string }) {
  return tasks.filter((task) => {
    const statusOk = filters.status === "All" || task.status === filters.status;
    const fromOk = !filters.fromDate || task.requestedDate >= filters.fromDate;
    const toOk = !filters.toDate || task.requestedDate <= filters.toDate;
    const query = (filters.query || "").toLowerCase().trim();
    const queryOk =
      !query ||
      task.title.toLowerCase().includes(query) ||
      task.description.toLowerCase().includes(query) ||
      task.changePoints.some((point) => point.toLowerCase().includes(query)) ||
      (task.clientName || "").toLowerCase().includes(query);

    return statusOk && fromOk && toOk && queryOk;
  });
}
