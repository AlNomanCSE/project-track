"use client";

import { STATUSES, type TaskFilters } from "@/lib/types";

type Props = {
  filters: TaskFilters;
  onChange: (next: TaskFilters) => void;
};

export default function TaskFilters({ filters, onChange }: Props) {
  return (
    <div className="card stack">
      <h2>Filters</h2>
      <div className="grid four">
        <label>
          Status
          <select
            value={filters.status}
            onChange={(e) => onChange({ ...filters, status: e.target.value as TaskFilters["status"] })}
          >
            <option value="All">All</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label>
          From Date
          <input
            type="date"
            value={filters.fromDate || ""}
            onChange={(e) => onChange({ ...filters, fromDate: e.target.value || undefined })}
          />
        </label>
        <label>
          To Date
          <input
            type="date"
            value={filters.toDate || ""}
            onChange={(e) => onChange({ ...filters, toDate: e.target.value || undefined })}
          />
        </label>
        <label>
          Search
          <input
            value={filters.query || ""}
            onChange={(e) => onChange({ ...filters, query: e.target.value })}
            placeholder="title / detail / client"
          />
        </label>
      </div>
    </div>
  );
}
