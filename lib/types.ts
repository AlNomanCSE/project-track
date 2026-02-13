export const STATUSES = [
  "Requested",
  "Client Review",
  "Confirmed",
  "Approved",
  "Working On It",
  "Completed",
  "Handover"
] as const;

export type TaskStatus = (typeof STATUSES)[number];

export type TaskHistory = {
  id: string;
  status: TaskStatus;
  changedAt: string;
  note?: string;
};

export type TaskHourRevision = {
  id: string;
  previousEstimatedHours: number;
  nextEstimatedHours: number;
  changedAt: string;
  reason?: string;
};

export type ProjectTask = {
  id: string;
  title: string;
  description: string;
  changePoints: string[];
  requestedDate: string;
  clientName?: string;
  status: TaskStatus;
  etaDate?: string;
  deliveryDate?: string;
  confirmedDate?: string;
  approvedDate?: string;
  estimatedHours: number;
  loggedHours: number;
  hourlyRate?: number;
  startDate?: string;
  completedDate?: string;
  handoverDate?: string;
  createdAt: string;
  updatedAt: string;
  history: TaskHistory[];
  hourRevisions: TaskHourRevision[];
};

export type TaskFilters = {
  status: "All" | TaskStatus;
  fromDate?: string;
  toDate?: string;
  query?: string;
};
