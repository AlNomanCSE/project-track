"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import PopupModal from "@/components/PopupModal";
import { formatShortDate } from "@/lib/date";
import { getTaskPendingHours, getTaskTotalHours } from "@/lib/task-hours";
import { STATUSES, type TaskApprovalStatus, type ProjectTask, type TaskStatus, type UserRole } from "@/lib/types";

type EditPayload = {
  title: string;
  clientName?: string;
  requestedDate: string;
  changePoints: string[];
  status: TaskStatus;
  estimatedHours: number;
  loggedHours: number;
  hourlyRate?: number;
  hourReason?: string;
  deliveryDate?: string;
  clientReviewDate?: string;
  startDate?: string;
  confirmedDate?: string;
  approvedDate?: string;
  completedDate?: string;
  handoverDate?: string;
};

type Props = {
  tasks: ProjectTask[];
  viewerRole: UserRole;
  viewerUserId: string;
  readOnly?: boolean;
  hideDetailsLink?: boolean;
  ownerByTaskId: Record<string, string | undefined>;
  approvalByTaskId: Record<string, TaskApprovalStatus>;
  onTaskUpdate: (taskId: string, payload: EditPayload) => void;
  onRequestDelete: (taskId: string) => void;
  onNotify: (title: string, message: string, variant?: "info" | "success" | "error") => void;
};

function approvalLabel(status: TaskApprovalStatus | undefined) {
  if (status === "approved") return "Admin Approved";
  if (status === "rejected") return "Admin Rejected";
  return "Pending Admin";
}

export default function TaskList({
  tasks,
  viewerRole,
  viewerUserId,
  readOnly = false,
  hideDetailsLink = false,
  ownerByTaskId,
  approvalByTaskId,
  onTaskUpdate,
  onRequestDelete,
  onNotify
}: Props) {
  const isClientViewer = viewerRole === "client";
  const isSuperViewer = viewerRole === "super_user";
  const canDeleteAnyTask = isSuperViewer;

  const canEditTask = (_taskId: string) => {
    if (readOnly) return false;
    return isSuperViewer;
  };

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  const [editTitleByTask, setEditTitleByTask] = useState<Record<string, string>>({});
  const [editClientByTask, setEditClientByTask] = useState<Record<string, string>>({});
  const [editDateByTask, setEditDateByTask] = useState<Record<string, string>>({});
  const [editPointsByTask, setEditPointsByTask] = useState<Record<string, string[]>>({});

  const [editStatusByTask, setEditStatusByTask] = useState<Record<string, TaskStatus>>({});
  const [editEstimatedByTask, setEditEstimatedByTask] = useState<Record<string, string>>({});
  const [editLoggedByTask, setEditLoggedByTask] = useState<Record<string, string>>({});
  const [editRateByTask, setEditRateByTask] = useState<Record<string, string>>({});
  const [editHourReasonByTask, setEditHourReasonByTask] = useState<Record<string, string>>({});

  const [editDeliveryByTask, setEditDeliveryByTask] = useState<Record<string, string>>({});
  const [editClientReviewByTask, setEditClientReviewByTask] = useState<Record<string, string>>({});
  const [editStartByTask, setEditStartByTask] = useState<Record<string, string>>({});
  const [editConfirmedByTask, setEditConfirmedByTask] = useState<Record<string, string>>({});
  const [editApprovedByTask, setEditApprovedByTask] = useState<Record<string, string>>({});
  const [editCompletedByTask, setEditCompletedByTask] = useState<Record<string, string>>({});
  const [editHandoverByTask, setEditHandoverByTask] = useState<Record<string, string>>({});

  const [editConfirmTask, setEditConfirmTask] = useState<ProjectTask | null>(null);
  const [deleteConfirmStepOneTaskId, setDeleteConfirmStepOneTaskId] = useState<string | null>(null);
  const [deleteConfirmStepTwoTaskId, setDeleteConfirmStepTwoTaskId] = useState<string | null>(null);
  const [pendingRollback, setPendingRollback] = useState<{ taskId: string; payload: EditPayload } | null>(null);
  const [rollbackReason, setRollbackReason] = useState("");

  if (!tasks.length) {
    return <div className="card">No requests found for this filter.</div>;
  }

  const parseNumber = (value: string, fallback: number): number => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  const parseOptionalNumber = (value: string, fallback?: number): number | undefined => {
    if (!value.trim()) return fallback;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  const isRollbackToClientReview = (from: TaskStatus, to: TaskStatus): boolean => {
    const fromIndex = STATUSES.indexOf(from);
    const confirmedIndex = STATUSES.indexOf("Confirmed");
    return to === "Client Review" && fromIndex >= confirmedIndex;
  };

  const handleSaveTask = (task: ProjectTask, selectedStatus: TaskStatus) => {
    const nextTitle = (editTitleByTask[task.id] ?? task.title).trim();
    const nextPoints = (editPointsByTask[task.id] ?? task.changePoints).map((p) => p.trim()).filter(Boolean);

    if (!nextTitle) {
      onNotify("Validation Error", "Title is required.", "error");
      return;
    }
    if (nextPoints.length === 0) {
      onNotify("Validation Error", "At least one change point is required.", "error");
      return;
    }

    const nextEstimated = parseNumber(
      editEstimatedByTask[task.id] ?? String(task.estimatedHours),
      task.estimatedHours
    );
    const nextLogged = parseNumber(editLoggedByTask[task.id] ?? String(task.loggedHours), task.loggedHours);
    const nextRate = parseOptionalNumber(
      editRateByTask[task.id] ?? String(task.hourlyRate ?? ""),
      task.hourlyRate
    );

    const payload: EditPayload = {
      title: nextTitle,
      clientName: (editClientByTask[task.id] ?? task.clientName ?? "").trim() || undefined,
      requestedDate: editDateByTask[task.id] ?? task.requestedDate,
      changePoints: nextPoints,
      status: isClientViewer ? task.status : selectedStatus,
      estimatedHours: isClientViewer ? task.estimatedHours : nextEstimated,
      loggedHours: isClientViewer ? task.loggedHours : nextLogged,
      hourlyRate: isClientViewer ? task.hourlyRate : nextRate,
      hourReason: isClientViewer ? undefined : (editHourReasonByTask[task.id] ?? "").trim() || undefined,
      deliveryDate: isClientViewer ? task.deliveryDate : (editDeliveryByTask[task.id] ?? "").trim() || undefined,
      clientReviewDate: isClientViewer ? task.clientReviewDate : (editClientReviewByTask[task.id] ?? "").trim() || undefined,
      startDate: isClientViewer ? task.startDate : (editStartByTask[task.id] ?? "").trim() || undefined,
      confirmedDate: isClientViewer ? task.confirmedDate : (editConfirmedByTask[task.id] ?? "").trim() || undefined,
      approvedDate: isClientViewer ? task.approvedDate : (editApprovedByTask[task.id] ?? "").trim() || undefined,
      completedDate: isClientViewer ? task.completedDate : (editCompletedByTask[task.id] ?? "").trim() || undefined,
      handoverDate: isClientViewer ? task.handoverDate : (editHandoverByTask[task.id] ?? "").trim() || undefined
    };

    if (!isClientViewer && isRollbackToClientReview(task.status, selectedStatus) && !payload.hourReason) {
      setRollbackReason("");
      setPendingRollback({ taskId: task.id, payload });
      return;
    }

    onTaskUpdate(task.id, payload);
    setEditingTaskId(null);
  };

  const startEdit = (task: ProjectTask) => {
    if (!canEditTask(task.id)) {
      onNotify("Access Denied", "You do not have permission to edit this task.", "error");
      return;
    }

    setEditingTaskId(task.id);
    setEditTitleByTask((prev) => ({ ...prev, [task.id]: task.title }));
    setEditClientByTask((prev) => ({ ...prev, [task.id]: task.clientName || "" }));
    setEditDateByTask((prev) => ({ ...prev, [task.id]: task.requestedDate }));
    setEditPointsByTask((prev) => ({ ...prev, [task.id]: task.changePoints.length ? [...task.changePoints] : [""] }));

    setEditStatusByTask((prev) => ({ ...prev, [task.id]: task.status }));
    setEditEstimatedByTask((prev) => ({ ...prev, [task.id]: String(task.estimatedHours) }));
    setEditLoggedByTask((prev) => ({ ...prev, [task.id]: String(task.loggedHours) }));
    setEditRateByTask((prev) => ({ ...prev, [task.id]: task.hourlyRate === undefined ? "" : String(task.hourlyRate) }));
    setEditHourReasonByTask((prev) => ({ ...prev, [task.id]: "" }));

    setEditDeliveryByTask((prev) => ({ ...prev, [task.id]: task.deliveryDate || "" }));
    setEditClientReviewByTask((prev) => ({ ...prev, [task.id]: task.clientReviewDate || "" }));
    setEditStartByTask((prev) => ({ ...prev, [task.id]: task.startDate || "" }));
    setEditConfirmedByTask((prev) => ({ ...prev, [task.id]: task.confirmedDate || "" }));
    setEditApprovedByTask((prev) => ({ ...prev, [task.id]: task.approvedDate || "" }));
    setEditCompletedByTask((prev) => ({ ...prev, [task.id]: task.completedDate || "" }));
    setEditHandoverByTask((prev) => ({ ...prev, [task.id]: task.handoverDate || "" }));
  };

  return (
    <div className="card table-card">
      <div className="list-table-wrap">
        <table className="list-table">
          <thead>
            <tr>
              <th>Request</th>
              <th>Client</th>
              <th>Dates</th>
              <th>Status</th>
              <th>Approval</th>
              <th>Hours</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => {
              const isEditing = editingTaskId === task.id;
              const points = editPointsByTask[task.id] ?? [""];
              const remainingHours = getTaskPendingHours(task);
              const totalHours = getTaskTotalHours(task);

              const selectedStatus = editStatusByTask[task.id] ?? task.status;
              const selectedStatusIndex = STATUSES.indexOf(selectedStatus);
              const canEditClientReviewDate = selectedStatusIndex >= STATUSES.indexOf("Client Review");
              const canEditStartDate = selectedStatusIndex >= STATUSES.indexOf("Working On It");
              const canEditConfirmedDate = selectedStatusIndex >= STATUSES.indexOf("Confirmed");
              const canEditApprovedDate = selectedStatusIndex >= STATUSES.indexOf("Approved");
              const canEditCompletedDate = selectedStatusIndex >= STATUSES.indexOf("Completed");
              const canEditHandoverDate = selectedStatusIndex >= STATUSES.indexOf("Handover");

              return (
                <Fragment key={task.id}>
                  <tr>
                    <td>
                      <div className="list-title">{task.title}</div>
                      <div className="list-sub">{task.changePoints.length} point(s)</div>
                    </td>
                    <td>{task.clientName || "-"}</td>
                    <td className="compact-cell">
                      <div>Req: {formatShortDate(task.requestedDate)}</div>
                      <div>Delivery: {formatShortDate(task.deliveryDate)}</div>
                      <div>Completed: {formatShortDate(task.completedDate)}</div>
                    </td>
                    <td>
                      <span className="badge" data-status={task.status}>
                        {task.status}
                      </span>
                    </td>
                    <td>
                      <span className="badge" data-approval={approvalByTaskId[task.id] || "pending"}>
                        {approvalLabel(approvalByTaskId[task.id])}
                      </span>
                    </td>
                    <td className="compact-cell">
                      <div>E: {task.estimatedHours}h</div>
                      <div>L: {totalHours}h</div>
                      <div>R: {remainingHours}h</div>
                    </td>
                    <td>
                      <div className="action-stack">
                        {!hideDetailsLink ? (
                          <Link href={`/requests/${task.id}`} className="button-link">
                            Details
                          </Link>
                        ) : null}
                        {canEditTask(task.id) ? (
                          <button type="button" className="secondary" onClick={() => setEditConfirmTask(task)}>
                            Edit
                          </button>
                        ) : null}
                        {canDeleteAnyTask && !readOnly ? (
                          <button type="button" className="danger" onClick={() => setDeleteConfirmStepOneTaskId(task.id)}>
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>

                  {isEditing ? (
                    <tr>
                      <td colSpan={7}>
                        <div className="edit-panel stack">
                          <h3>{isClientViewer ? "Edit Request (Pending Admin Approval)" : "Edit Request"}</h3>

                          <div className="grid three">
                            <label>
                              Title
                              <input
                                value={editTitleByTask[task.id] ?? task.title}
                                onChange={(e) => setEditTitleByTask((prev) => ({ ...prev, [task.id]: e.target.value }))}
                              />
                            </label>
                            <label>
                              Client
                              <input
                                value={editClientByTask[task.id] ?? task.clientName ?? ""}
                                onChange={(e) => setEditClientByTask((prev) => ({ ...prev, [task.id]: e.target.value }))}
                              />
                            </label>
                            <label>
                              Request Date
                              <input
                                type="date"
                                value={editDateByTask[task.id] ?? task.requestedDate}
                                onChange={(e) => setEditDateByTask((prev) => ({ ...prev, [task.id]: e.target.value }))}
                              />
                            </label>
                          </div>

                          {!isClientViewer ? (
                            <>
                              <div className="grid four">
                                <label>
                                  Workflow Status
                                  <select
                                    value={selectedStatus}
                                    onChange={(e) => setEditStatusByTask((prev) => ({ ...prev, [task.id]: e.target.value as TaskStatus }))}
                                  >
                                    {STATUSES.map((status) => (
                                      <option key={status} value={status}>
                                        {status}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  Estimated Hours
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    value={editEstimatedByTask[task.id] ?? String(task.estimatedHours)}
                                    onChange={(e) => setEditEstimatedByTask((prev) => ({ ...prev, [task.id]: e.target.value }))}
                                  />
                                </label>
                                <label>
                                  Logged Hours
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    value={editLoggedByTask[task.id] ?? String(task.loggedHours)}
                                    onChange={(e) => setEditLoggedByTask((prev) => ({ ...prev, [task.id]: e.target.value }))}
                                  />
                                </label>
                                <label>
                                  Hourly Rate
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={editRateByTask[task.id] ?? String(task.hourlyRate ?? "")}
                                    onChange={(e) => setEditRateByTask((prev) => ({ ...prev, [task.id]: e.target.value }))}
                                  />
                                </label>
                              </div>

                              <label>
                                Hours Update Reason
                                <input
                                  value={editHourReasonByTask[task.id] ?? ""}
                                  onChange={(e) => setEditHourReasonByTask((prev) => ({ ...prev, [task.id]: e.target.value }))}
                                  placeholder="Optional reason"
                                />
                              </label>

                              <div className="grid three">
                                <label>
                                  Delivery Date
                                  <input
                                    type="date"
                                    value={editDeliveryByTask[task.id] ?? task.deliveryDate ?? ""}
                                    onChange={(e) => setEditDeliveryByTask((prev) => ({ ...prev, [task.id]: e.target.value }))}
                                  />
                                </label>
                                <label>
                                  Start Date
                                  <input
                                    type="date"
                                    value={editStartByTask[task.id] ?? task.startDate ?? ""}
                                    disabled={!canEditStartDate}
                                    onChange={(e) => setEditStartByTask((prev) => ({ ...prev, [task.id]: e.target.value }))}
                                  />
                                </label>
                                <label>
                                  Client Review Date
                                  <input
                                    type="date"
                                    value={editClientReviewByTask[task.id] ?? task.clientReviewDate ?? ""}
                                    disabled={!canEditClientReviewDate}
                                    onChange={(e) => setEditClientReviewByTask((prev) => ({ ...prev, [task.id]: e.target.value }))}
                                  />
                                </label>
                                <label>
                                  Confirmed Date
                                  <input
                                    type="date"
                                    value={editConfirmedByTask[task.id] ?? task.confirmedDate ?? ""}
                                    disabled={!canEditConfirmedDate}
                                    onChange={(e) => setEditConfirmedByTask((prev) => ({ ...prev, [task.id]: e.target.value }))}
                                  />
                                </label>
                                <label>
                                  Approved Date
                                  <input
                                    type="date"
                                    value={editApprovedByTask[task.id] ?? task.approvedDate ?? ""}
                                    disabled={!canEditApprovedDate}
                                    onChange={(e) => setEditApprovedByTask((prev) => ({ ...prev, [task.id]: e.target.value }))}
                                  />
                                </label>
                                <label>
                                  Completed Date
                                  <input
                                    type="date"
                                    value={editCompletedByTask[task.id] ?? task.completedDate ?? ""}
                                    disabled={!canEditCompletedDate}
                                    onChange={(e) => setEditCompletedByTask((prev) => ({ ...prev, [task.id]: e.target.value }))}
                                  />
                                </label>
                                <label>
                                  Handover Date
                                  <input
                                    type="date"
                                    value={editHandoverByTask[task.id] ?? task.handoverDate ?? ""}
                                    disabled={!canEditHandoverDate}
                                    onChange={(e) => setEditHandoverByTask((prev) => ({ ...prev, [task.id]: e.target.value }))}
                                  />
                                </label>
                              </div>
                            </>
                          ) : (
                            <small className="muted">
                              Client edits are saved as pending. Admin must approve before final confirmation.
                            </small>
                          )}

                          <div className="stack">
                            <small>Change Points</small>
                            {points.map((point, idx) => (
                              <div className="row gap" key={`${task.id}-point-edit-${idx}`}>
                                <input
                                  value={point}
                                  onChange={(e) =>
                                    setEditPointsByTask((prev) => {
                                      const next = [...(prev[task.id] ?? [""])];
                                      next[idx] = e.target.value;
                                      return { ...prev, [task.id]: next };
                                    })
                                  }
                                />
                                {points.length > 1 ? (
                                  <button
                                    type="button"
                                    className="secondary"
                                    onClick={() =>
                                      setEditPointsByTask((prev) => ({
                                        ...prev,
                                        [task.id]: (prev[task.id] ?? [""]).filter((_, i) => i !== idx)
                                      }))
                                    }
                                  >
                                    Remove
                                  </button>
                                ) : null}
                              </div>
                            ))}
                            <div>
                              <button
                                type="button"
                                className="secondary"
                                onClick={() =>
                                  setEditPointsByTask((prev) => ({ ...prev, [task.id]: [...(prev[task.id] ?? [""]), ""] }))
                                }
                              >
                                + Add Point
                              </button>
                            </div>
                          </div>

                          <div className="row gap">
                            <button
                              type="button"
                              onClick={() => handleSaveTask(task, selectedStatus)}
                            >
                              {isClientViewer ? "Submit For Approval" : "Save Request"}
                            </button>
                            <button type="button" className="secondary" onClick={() => setEditingTaskId(null)}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <PopupModal
        open={pendingRollback !== null}
        title="Rollback Reason Required"
        message="This status move will rollback workflow to Client Review and reset estimate/dates. Please provide reason."
        variant="confirm"
        confirmLabel="Confirm Rollback"
        confirmDisabled={!rollbackReason.trim()}
        confirmOrder="confirm-first"
        onClose={() => {
          setPendingRollback(null);
          setRollbackReason("");
        }}
        onConfirm={() => {
          if (!pendingRollback) return;
          onTaskUpdate(pendingRollback.taskId, {
            ...pendingRollback.payload,
            hourReason: rollbackReason.trim()
          });
          setEditingTaskId(null);
          setPendingRollback(null);
          setRollbackReason("");
        }}
      >
        <label>
          Rollback Reason
          <input
            value={rollbackReason}
            onChange={(e) => setRollbackReason(e.target.value)}
            placeholder="Why are you moving this task back to Client Review?"
          />
        </label>
      </PopupModal>

      <PopupModal
        open={editConfirmTask !== null}
        title="Edit Request"
        message="Are you sure you want to edit this request?"
        variant="confirm"
        confirmLabel="Yes, Edit"
        onClose={() => setEditConfirmTask(null)}
        onConfirm={() => {
            if (editConfirmTask) {
              if (!canEditTask(editConfirmTask.id)) {
                onNotify("Access Denied", "You do not have permission to edit this task.", "error");
                setEditConfirmTask(null);
                return;
              }
            startEdit(editConfirmTask);
          }
        }}
      />

      <PopupModal
        open={canDeleteAnyTask && deleteConfirmStepOneTaskId !== null}
        title="Delete Request"
        message="Are you sure you want to delete this request?"
        variant="confirm"
        confirmLabel="Yes, Continue"
        onClose={() => setDeleteConfirmStepOneTaskId(null)}
        onConfirm={() => {
          if (deleteConfirmStepOneTaskId) {
            setDeleteConfirmStepTwoTaskId(deleteConfirmStepOneTaskId);
          }
        }}
      />

      <PopupModal
        open={canDeleteAnyTask && deleteConfirmStepTwoTaskId !== null}
        title="Final Confirmation"
        message="Please confirm again. This delete action cannot be undone."
        variant="confirm"
        confirmLabel="Confirm Delete"
        onClose={() => setDeleteConfirmStepTwoTaskId(null)}
        onConfirm={() => {
          if (deleteConfirmStepTwoTaskId) {
            onRequestDelete(deleteConfirmStepTwoTaskId);
          }
        }}
      />
    </div>
  );
}
