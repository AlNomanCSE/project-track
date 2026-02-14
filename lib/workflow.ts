import { STATUSES, type ProjectTask, type TaskStatus } from "@/lib/types";

function isRollbackToClientReview(from: TaskStatus, to: TaskStatus): boolean {
  const fromIndex = STATUSES.indexOf(from);
  const confirmedIndex = STATUSES.indexOf("Confirmed");
  return to === "Client Review" && fromIndex >= confirmedIndex;
}

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (isRollbackToClientReview(from, to)) return true;

  const fromIndex = STATUSES.indexOf(from);
  const toIndex = STATUSES.indexOf(to);
  return toIndex === fromIndex || toIndex === fromIndex + 1;
}

export function applyStatusMetadata(task: ProjectTask, nextStatus: TaskStatus, statusDate?: string): ProjectTask {
  const effectiveDate = statusDate;
  if (!effectiveDate) return task;

  if (nextStatus === "Client Review") {
    task.clientReviewDate = effectiveDate;
  }

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
