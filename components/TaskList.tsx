"use client";

import Link from "next/link";
import { useState } from "react";
import PopupModal from "@/components/PopupModal";
import { STATUSES, type ProjectTask, type TaskStatus } from "@/lib/types";

type EditPayload = {
  title: string;
  clientName?: string;
  requestedDate: string;
  changePoints: string[];
  deliveryDate?: string;
  confirmedDate?: string;
  approvedDate?: string;
  completedDate?: string;
  handoverDate?: string;
};

type Props = {
  tasks: ProjectTask[];
  onStatusUpdate: (
    taskId: string,
    nextStatus: TaskStatus,
    note: string,
    statusDate?: string,
    estimatedHoursOnStatus?: number
  ) => void;
  onHoursUpdate: (taskId: string, payload: { estimatedHours: number; loggedHours: number; hourlyRate?: number; reason?: string }) => void;
  onTaskUpdate: (taskId: string, payload: EditPayload) => void;
  onRequestDelete: (taskId: string) => void;
  onNotify: (title: string, message: string, variant?: "info" | "success" | "error") => void;
};

export default function TaskList({ tasks, onStatusUpdate, onHoursUpdate, onTaskUpdate, onRequestDelete, onNotify }: Props) {
  const [noteByTask, setNoteByTask] = useState<Record<string, string>>({});
  const [statusDateByTask, setStatusDateByTask] = useState<Record<string, string>>({});
  const [nextStatusByTask, setNextStatusByTask] = useState<Record<string, TaskStatus>>({});

  const [estimatedByTask, setEstimatedByTask] = useState<Record<string, string>>({});
  const [loggedByTask, setLoggedByTask] = useState<Record<string, string>>({});
  const [rateByTask, setRateByTask] = useState<Record<string, string>>({});
  const [reEstimateReasonByTask, setReEstimateReasonByTask] = useState<Record<string, string>>({});

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitleByTask, setEditTitleByTask] = useState<Record<string, string>>({});
  const [editClientByTask, setEditClientByTask] = useState<Record<string, string>>({});
  const [editDateByTask, setEditDateByTask] = useState<Record<string, string>>({});
  const [editPointsByTask, setEditPointsByTask] = useState<Record<string, string[]>>({});
  const [editDeliveryByTask, setEditDeliveryByTask] = useState<Record<string, string>>({});
  const [editConfirmedByTask, setEditConfirmedByTask] = useState<Record<string, string>>({});
  const [editApprovedByTask, setEditApprovedByTask] = useState<Record<string, string>>({});
  const [editCompletedByTask, setEditCompletedByTask] = useState<Record<string, string>>({});
  const [editHandoverByTask, setEditHandoverByTask] = useState<Record<string, string>>({});
  const [editConfirmTask, setEditConfirmTask] = useState<ProjectTask | null>(null);
  const [deleteConfirmStepOneTaskId, setDeleteConfirmStepOneTaskId] = useState<string | null>(null);
  const [deleteConfirmStepTwoTaskId, setDeleteConfirmStepTwoTaskId] = useState<string | null>(null);

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

  const startEdit = (task: ProjectTask) => {
    setEditingTaskId(task.id);
    setEditTitleByTask((prev) => ({ ...prev, [task.id]: task.title }));
    setEditClientByTask((prev) => ({ ...prev, [task.id]: task.clientName || "" }));
    setEditDateByTask((prev) => ({ ...prev, [task.id]: task.requestedDate }));
    setEditPointsByTask((prev) => ({ ...prev, [task.id]: task.changePoints.length ? [...task.changePoints] : [""] }));
    setEditDeliveryByTask((prev) => ({ ...prev, [task.id]: task.deliveryDate || "" }));
    setEditConfirmedByTask((prev) => ({ ...prev, [task.id]: task.confirmedDate || "" }));
    setEditApprovedByTask((prev) => ({ ...prev, [task.id]: task.approvedDate || "" }));
    setEditCompletedByTask((prev) => ({ ...prev, [task.id]: task.completedDate || "" }));
    setEditHandoverByTask((prev) => ({ ...prev, [task.id]: task.handoverDate || "" }));
  };

  return (
    <div className="task-list stack">
      {tasks.map((task) => {
        const estimatedHours = parseNumber(estimatedByTask[task.id] ?? String(task.estimatedHours), task.estimatedHours);
        const loggedHours = parseNumber(loggedByTask[task.id] ?? String(task.loggedHours), task.loggedHours);
        const remainingHours = Math.max(estimatedHours - loggedHours, 0);
        const isEditing = editingTaskId === task.id;
        const points = editPointsByTask[task.id] ?? [""];

        return (
          <article className="card request-card" key={task.id}>
            <div className="row between gap request-head">
              <div className="stack tight">
                <strong>{task.title}</strong>
                <span className="muted">{task.changePoints.length} point(s)</span>
              </div>
              <span className="badge" data-status={task.status}>
                {task.status}
              </span>
            </div>

            <div className="request-sections">
              <section className="request-block">
                <small>Client & Dates</small>
                <div className="stack tight">
                  <span>Client: {task.clientName || "-"}</span>
                  <span>Req: {task.requestedDate}</span>
                  <span>Delivery: {task.deliveryDate || "-"}</span>
                  <span>Confirmed: {task.confirmedDate || "-"}</span>
                  <span>Approved: {task.approvedDate || "-"}</span>
                  <span>Completed: {task.completedDate || "-"}</span>
                  <span>Handover: {task.handoverDate || "-"}</span>
                </div>
              </section>

              <section className="request-block">
                <small>Workflow</small>
                <div className="stack tight">
                  <span className="muted">Estimated hours must be set before `Confirmed` or later.</span>
                  <select
                    value={nextStatusByTask[task.id] ?? task.status}
                    onChange={(e) => setNextStatusByTask((p) => ({ ...p, [task.id]: e.target.value as TaskStatus }))}
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  <input
                    value={noteByTask[task.id] || ""}
                    onChange={(e) => setNoteByTask((p) => ({ ...p, [task.id]: e.target.value }))}
                    placeholder="Status note"
                  />
                  <label className="inline-label">
                    Status Date
                    <input
                      type="date"
                      value={statusDateByTask[task.id] || ""}
                      onChange={(e) => setStatusDateByTask((p) => ({ ...p, [task.id]: e.target.value }))}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                    onStatusUpdate(
                        task.id,
                        nextStatusByTask[task.id] ?? task.status,
                        noteByTask[task.id] || "",
                        statusDateByTask[task.id] || undefined,
                        parseNumber(estimatedByTask[task.id] ?? String(task.estimatedHours), task.estimatedHours)
                      )
                    }
                  >
                    Update Status
                  </button>
                </div>
              </section>

              <section className="request-block">
                <small>Hours</small>
                <div className="stack tight">
                  <div className="hours-line">E: {task.estimatedHours}h | L: {task.loggedHours}h | R: {remainingHours}h</div>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={estimatedByTask[task.id] ?? String(task.estimatedHours)}
                    onChange={(e) => setEstimatedByTask((p) => ({ ...p, [task.id]: e.target.value }))}
                    placeholder="Estimated"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={loggedByTask[task.id] ?? String(task.loggedHours)}
                    onChange={(e) => setLoggedByTask((p) => ({ ...p, [task.id]: e.target.value }))}
                    placeholder="Logged"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={rateByTask[task.id] ?? String(task.hourlyRate ?? "")}
                    onChange={(e) => setRateByTask((p) => ({ ...p, [task.id]: e.target.value }))}
                    placeholder="Hourly rate"
                  />
                  <input
                    value={reEstimateReasonByTask[task.id] || ""}
                    onChange={(e) => setReEstimateReasonByTask((p) => ({ ...p, [task.id]: e.target.value }))}
                    placeholder="Re-estimation reason"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const nextEstimated = parseNumber(estimatedByTask[task.id] ?? String(task.estimatedHours), task.estimatedHours);
                      const nextLogged = parseNumber(loggedByTask[task.id] ?? String(task.loggedHours), task.loggedHours);
                      const nextRate = parseOptionalNumber(rateByTask[task.id] ?? String(task.hourlyRate ?? ""), task.hourlyRate);

                      onHoursUpdate(task.id, {
                        estimatedHours: nextEstimated,
                        loggedHours: nextLogged,
                        hourlyRate: nextRate,
                        reason: reEstimateReasonByTask[task.id] || undefined
                      });
                    }}
                  >
                    Save Hours
                  </button>
                </div>
              </section>

              <section className="request-block">
                <small>Actions</small>
                <div className="stack tight">
                  <Link href={`/requests/${task.id}`} className="button-link">
                    View Details
                  </Link>
                  <button type="button" className="secondary" onClick={() => setEditConfirmTask(task)}>
                    Edit
                  </button>
                  <button type="button" className="danger" onClick={() => setDeleteConfirmStepOneTaskId(task.id)}>
                    Delete
                  </button>
                </div>
              </section>
            </div>

            {isEditing ? (
              <div className="edit-panel stack">
                <h3>Edit Request</h3>
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
                          <div className="grid five">
                            <label>
                              Delivery Date
                              <input
                                type="date"
                                value={editDeliveryByTask[task.id] ?? task.deliveryDate ?? ""}
                                onChange={(e) => setEditDeliveryByTask((prev) => ({ ...prev, [task.id]: e.target.value }))}
                              />
                            </label>
                            <label>
                              Confirmed Date
                              <input
                                type="date"
                                value={editConfirmedByTask[task.id] ?? task.confirmedDate ?? ""}
                                onChange={(e) => setEditConfirmedByTask((prev) => ({ ...prev, [task.id]: e.target.value }))}
                              />
                            </label>
                            <label>
                              Approved Date
                              <input
                                type="date"
                                value={editApprovedByTask[task.id] ?? task.approvedDate ?? ""}
                                onChange={(e) => setEditApprovedByTask((prev) => ({ ...prev, [task.id]: e.target.value }))}
                              />
                            </label>
                            <label>
                              Completed Date
                              <input
                                type="date"
                                value={editCompletedByTask[task.id] ?? task.completedDate ?? ""}
                                onChange={(e) => setEditCompletedByTask((prev) => ({ ...prev, [task.id]: e.target.value }))}
                              />
                            </label>
                            <label>
                              Handover Date
                              <input
                                type="date"
                                value={editHandoverByTask[task.id] ?? task.handoverDate ?? ""}
                                onChange={(e) => setEditHandoverByTask((prev) => ({ ...prev, [task.id]: e.target.value }))}
                              />
                            </label>
                          </div>

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
                    onClick={() => {
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

                                onTaskUpdate(task.id, {
                                  title: nextTitle,
                                  clientName: (editClientByTask[task.id] ?? task.clientName ?? "").trim() || undefined,
                                  requestedDate: editDateByTask[task.id] ?? task.requestedDate,
                                  changePoints: nextPoints,
                                  deliveryDate: (editDeliveryByTask[task.id] ?? "").trim() || undefined,
                                  confirmedDate: (editConfirmedByTask[task.id] ?? "").trim() || undefined,
                                  approvedDate: (editApprovedByTask[task.id] ?? "").trim() || undefined,
                                  completedDate: (editCompletedByTask[task.id] ?? "").trim() || undefined,
                                  handoverDate: (editHandoverByTask[task.id] ?? "").trim() || undefined
                                });
                      setEditingTaskId(null);
                    }}
                  >
                    Save Request
                  </button>
                  <button type="button" className="secondary" onClick={() => setEditingTaskId(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </article>
        );
      })}

      <PopupModal
        open={editConfirmTask !== null}
        title="Edit Request"
        message="Are you sure you want to edit this request?"
        variant="confirm"
        confirmLabel="Yes, Edit"
        onClose={() => setEditConfirmTask(null)}
        onConfirm={() => {
          if (editConfirmTask) {
            startEdit(editConfirmTask);
          }
        }}
      />

      <PopupModal
        open={deleteConfirmStepOneTaskId !== null}
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
        open={deleteConfirmStepTwoTaskId !== null}
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
