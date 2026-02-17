"use client";

import { useEffect, useMemo, useState } from "react";
import { formatShortDate } from "@/lib/date";
import type { TodoInput, TodoItem } from "@/lib/types";

type Props = {
  items: TodoItem[];
  onCreate: (input: TodoInput) => void;
  onUpdate: (id: string, input: TodoInput) => void;
  onDelete: (id: string) => void;
  onToggleStatus: (id: string, next: "not_done" | "done") => void;
  onNotify: (title: string, message: string, variant?: "info" | "success" | "error") => void;
};

type FormState = {
  title: string;
  details: string;
  dueDate: string;
};

const ITEMS_PER_PAGE = 10;

function initialForm(): FormState {
  return {
    title: "",
    details: "",
    dueDate: new Date().toISOString().slice(0, 10)
  };
}

export default function TodoSection({ items, onCreate, onUpdate, onDelete, onToggleStatus, onNotify }: Props) {
  const [form, setForm] = useState<FormState>(() => initialForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => {
        if (a.status !== b.status) return a.status === "not_done" ? -1 : 1;
        return a.dueDate.localeCompare(b.dueDate);
      }),
    [items]
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / ITEMS_PER_PAGE));
  const paginated = useMemo(() => {
    const current = Math.min(Math.max(page, 1), totalPages);
    const start = (current - 1) * ITEMS_PER_PAGE;
    return sorted.slice(start, start + ITEMS_PER_PAGE);
  }, [sorted, page, totalPages]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const submit = () => {
    const title = form.title.trim();
    const dueDate = form.dueDate;
    if (!title || !dueDate) {
      onNotify("Validation", "Task title and date are required.", "error");
      return;
    }

    const input: TodoInput = {
      title,
      details: form.details.trim() || undefined,
      dueDate
    };

    if (editingId) {
      onUpdate(editingId, input);
    } else {
      onCreate(input);
    }

    setForm(initialForm());
    setEditingId(null);
  };

  const startEdit = (item: TodoItem) => {
    setEditingId(item.id);
    setForm({
      title: item.title,
      details: item.details ?? "",
      dueDate: item.dueDate
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(initialForm());
  };

  return (
    <section className="card stack">
      <div className="row between gap">
        <h3>To-Do Planner</h3>
        <small>CRUD + inline status update</small>
      </div>

      <div className="grid three">
        <label>
          Task
          <input
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="Example: Update landing page"
          />
        </label>
        <label>
          Date
          <input type="date" value={form.dueDate} onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))} />
        </label>
        <label>
          Details (optional)
          <input
            value={form.details}
            onChange={(e) => setForm((prev) => ({ ...prev, details: e.target.value }))}
            placeholder="Any notes..."
          />
        </label>
      </div>

      <div className="row gap">
        <button type="button" onClick={submit}>
          {editingId ? "Update To-Do" : "Add To-Do"}
        </button>
        {editingId ? (
          <button type="button" className="secondary" onClick={cancelEdit}>
            Cancel
          </button>
        ) : null}
      </div>

      <div className="row between gap">
        <small className="muted">
          Showing {paginated.length} of {sorted.length} items
        </small>
        <div className="row gap">
          <button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(prev - 1, 1))}>
            Prev
          </button>
          <small className="muted">
            Page {page} / {totalPages}
          </small>
          <button
            type="button"
            className="secondary"
            disabled={page >= totalPages}
            onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
          >
            Next
          </button>
        </div>
      </div>

      {paginated.length === 0 ? (
        <p className="muted">No to-do item yet.</p>
      ) : (
        <div className="table-card">
          <div className="list-table-wrap">
            <table className="list-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Details</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((item) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>{formatShortDate(item.dueDate)}</td>
                    <td>
                      <button
                        type="button"
                        className={item.status === "done" ? "secondary" : ""}
                        onClick={() => onToggleStatus(item.id, item.status === "done" ? "not_done" : "done")}
                      >
                        {item.status === "done" ? "Done" : "Not Done"}
                      </button>
                    </td>
                    <td>{item.details || "-"}</td>
                    <td>
                      <div className="row gap">
                        <button type="button" className="secondary" onClick={() => startEdit(item)}>
                          Edit
                        </button>
                        <button type="button" className="danger" onClick={() => onDelete(item.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
