"use client";

import { useMemo, useState } from "react";

type TaskFormValues = {
  title: string;
  changePoints: string[];
  requestedDate: string;
  clientName: string;
  estimatedHours?: number;
  hourlyRate?: number;
};

type Props = {
  onSubmit: (values: TaskFormValues) => void;
  onNotify: (title: string, message: string, variant?: "info" | "success" | "error") => void;
};

export default function TaskForm({ onSubmit, onNotify }: Props) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [values, setValues] = useState({
    title: "",
    changePoints: [""],
    requestedDate: today,
    clientName: "",
    estimatedHours: "",
    hourlyRate: ""
  });

  return (
    <form
      className="card stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (!values.title.trim()) return;

        const estimatedHours = values.estimatedHours.trim() ? Number(values.estimatedHours) : undefined;
        if (estimatedHours !== undefined && (!Number.isFinite(estimatedHours) || estimatedHours < 0)) {
          onNotify("Invalid Hours", "Estimated hours must be a valid positive number.", "error");
          return;
        }

        const hourlyRateNumber = values.hourlyRate.trim() ? Number(values.hourlyRate) : undefined;
        if (hourlyRateNumber !== undefined && (!Number.isFinite(hourlyRateNumber) || hourlyRateNumber < 0)) {
          onNotify("Invalid Rate", "Hourly rate must be a valid positive number.", "error");
          return;
        }

        const changePoints = values.changePoints.map((point) => point.trim()).filter(Boolean);
        if (changePoints.length === 0) {
          onNotify("Missing Details", "Please add at least one change detail point.", "error");
          return;
        }

        onSubmit({
          title: values.title,
          changePoints,
          requestedDate: values.requestedDate,
          clientName: values.clientName,
          estimatedHours,
          hourlyRate: hourlyRateNumber
        });

        setValues((prev) => ({
          ...prev,
          title: "",
          changePoints: [""],
          estimatedHours: "",
          hourlyRate: ""
        }));
      }}
    >
      <h2>New Change Request</h2>
      <div className="grid two">
        <label>
          Title
          <input
            required
            value={values.title}
            onChange={(e) => setValues((p) => ({ ...p, title: e.target.value }))}
            placeholder="Example: Update payment flow"
          />
        </label>
        <label>
          Client Name
          <input
            value={values.clientName}
            onChange={(e) => setValues((p) => ({ ...p, clientName: e.target.value }))}
            placeholder="Example: ACME Corp"
          />
        </label>
      </div>

      <div className="stack">
        <label>Change Details (Point-wise)</label>
        <div className="stack">
          {values.changePoints.map((point, index) => (
            <div className="row gap" key={`point-${index}`}>
              <input
                value={point}
                onChange={(e) =>
                  setValues((prev) => {
                    const next = [...prev.changePoints];
                    next[index] = e.target.value;
                    return { ...prev, changePoints: next };
                  })
                }
                placeholder={`Point ${index + 1}`}
              />
              {values.changePoints.length > 1 ? (
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    setValues((prev) => ({
                      ...prev,
                      changePoints: prev.changePoints.filter((_, itemIndex) => itemIndex !== index)
                    }))
                  }
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
        </div>
        <div>
          <button
            type="button"
            className="secondary"
            onClick={() => setValues((prev) => ({ ...prev, changePoints: [...prev.changePoints, ""] }))}
          >
            + Add Point
          </button>
        </div>
      </div>

      <div className="grid three">
        <label>
          Request Date
          <input
            type="date"
            value={values.requestedDate}
            onChange={(e) => setValues((p) => ({ ...p, requestedDate: e.target.value }))}
          />
        </label>
        <label>
          Estimated Hours
          <input
            type="number"
            min="0"
            step="0.5"
            value={values.estimatedHours}
            onChange={(e) => setValues((p) => ({ ...p, estimatedHours: e.target.value }))}
            placeholder="Optional now, required on confirm"
          />
        </label>
        <label>
          Hourly Rate (Optional)
          <input
            type="number"
            min="0"
            step="0.01"
            value={values.hourlyRate}
            onChange={(e) => setValues((p) => ({ ...p, hourlyRate: e.target.value }))}
            placeholder="Example: 25"
          />
        </label>
      </div>

      <div className="align-end">
        <button type="submit">Add Request</button>
      </div>
    </form>
  );
}
