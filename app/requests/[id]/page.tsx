"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatDateTime, formatShortDate } from "@/lib/date";
import { taskRepository } from "@/lib/storage";
import type { ProjectTask } from "@/lib/types";

export default function RequestDetailsPage() {
  const params = useParams<{ id: string }>();
  const [tasks, setTasks] = useState<ProjectTask[]>([]);

  useEffect(() => {
    let active = true;

    const loadTasks = async () => {
      const next = await taskRepository.read();
      if (active) {
        setTasks(next);
      }
    };

    void loadTasks();

    return () => {
      active = false;
    };
  }, []);

  const task = useMemo(() => {
    if (!params?.id) return null;
    const id = decodeURIComponent(params.id);
    return tasks.find((item) => item.id === id) || null;
  }, [params?.id, tasks]);

  if (!task) {
    return (
      <main className="page">
        <section className="card stack">
          <h1>Request Not Found</h1>
          <p className="muted">This request may have been deleted or the URL is invalid.</p>
          <div>
            <Link href="/" className="button-link">
              Back To Dashboard
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const remainingHours = Math.max(task.estimatedHours - task.loggedHours, 0);
  const estimatedCost = task.hourlyRate !== undefined ? (task.estimatedHours * task.hourlyRate).toFixed(2) : "Not set";

  return (
    <main className="page">
      <section className="card stack">
        <div className="row between gap">
          <div>
            <h1>{task.title}</h1>
            <p className="muted">Request ID: {task.id}</p>
          </div>
          <span className="badge" data-status={task.status}>
            {task.status}
          </span>
        </div>
        <div>
          <Link href="/" className="button-link secondary-link">
            Back To Dashboard
          </Link>
        </div>
      </section>

      <section className="card stack">
        <h2>Request Info</h2>
        <div className="details-grid">
          <div>
            <small>Client</small>
            <p>{task.clientName || "-"}</p>
          </div>
          <div>
            <small>Requested Date</small>
            <p>{formatShortDate(task.requestedDate)}</p>
          </div>
          <div>
            <small>Delivery Date</small>
            <p>{formatShortDate(task.deliveryDate)}</p>
          </div>
          <div>
            <small>Confirmed Date</small>
            <p>{formatShortDate(task.confirmedDate)}</p>
          </div>
          <div>
            <small>Approved Date</small>
            <p>{formatShortDate(task.approvedDate)}</p>
          </div>
          <div>
            <small>Completed Date</small>
            <p>{formatShortDate(task.completedDate)}</p>
          </div>
          <div>
            <small>Handover Date</small>
            <p>{formatShortDate(task.handoverDate)}</p>
          </div>
          <div>
            <small>Created</small>
            <p>{formatDateTime(task.createdAt)}</p>
          </div>
        </div>
      </section>

      <section className="card stack">
        <h2>Change Details</h2>
        {task.changePoints.length > 0 ? (
          <ul className="change-points">
            {task.changePoints.map((point, index) => (
              <li key={`${task.id}-detail-point-${index}`}>{point}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">No change points provided.</p>
        )}
      </section>

      <section className="card stack">
        <h2>Hours Summary</h2>
        <div className="details-grid">
          <div>
            <small>Estimated Hours</small>
            <p>{task.estimatedHours}</p>
          </div>
          <div>
            <small>Logged Hours</small>
            <p>{task.loggedHours}</p>
          </div>
          <div>
            <small>Remaining Hours</small>
            <p>{remainingHours}</p>
          </div>
          <div>
            <small>Estimated Cost</small>
            <p>{estimatedCost}</p>
          </div>
        </div>
      </section>

      <section className="card stack">
        <h2>Status History</h2>
        <ul className="history">
          {task.history
            .slice()
            .reverse()
            .map((item) => (
              <li key={item.id}>
                <strong>{item.status}</strong> on {formatDateTime(item.changedAt)}
                {item.note ? ` - ${item.note}` : ""}
              </li>
            ))}
        </ul>
      </section>

      <section className="card stack">
        <h2>Re-estimation Log</h2>
        {task.hourRevisions.length > 0 ? (
          <ul className="history">
            {task.hourRevisions
              .slice()
              .reverse()
              .map((entry) => (
                <li key={entry.id}>
                  {entry.previousEstimatedHours}h to {entry.nextEstimatedHours}h on {formatDateTime(entry.changedAt)}
                  {entry.reason ? ` - ${entry.reason}` : ""}
                </li>
              ))}
          </ul>
        ) : (
          <p className="muted">No re-estimation entries yet.</p>
        )}
      </section>
    </main>
  );
}
