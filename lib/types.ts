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
export const USER_ROLES = ["super_user", "admin", "client"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;
export type UserApprovalStatus = (typeof USER_APPROVAL_STATUSES)[number];

export const TASK_APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;
export type TaskApprovalStatus = (typeof TASK_APPROVAL_STATUSES)[number];

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserApprovalStatus;
  createdAt: string;
  approvedByUserId?: string;
  approvedAt?: string;
  rejectionReason?: string;
};

export type TaskAccessMeta = {
  taskId: string;
  ownerUserId?: string;
  approvalStatus: TaskApprovalStatus;
  decisionNote?: string;
  decidedByUserId?: string;
  decidedAt?: string;
  updatedAt: string;
};

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
  clientReviewDate?: string;
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

export const WEEKLY_PLAN_STATUSES = ["Not Started", "In Progress", "Blocked", "Done"] as const;
export type WeeklyPlanStatus = (typeof WEEKLY_PLAN_STATUSES)[number];

export const WEEKLY_DAY_WORK_AREAS = ["Frontend", "Backend", "Frontend + Backend", "Other"] as const;
export type WeeklyDayWorkArea = (typeof WEEKLY_DAY_WORK_AREAS)[number];

export type WeeklyPlanDailyUpdate = {
  id: string;
  date: string;
  developerName: string;
  note: string;
  workArea: WeeklyDayWorkArea;
  spentHours?: number;
  progressPercent?: number;
  updatedAt: string;
};

export type WeeklyPlan = {
  id: string;
  weekStartDate: string;
  weekEndDate: string;
  dailyUpdates: WeeklyPlanDailyUpdate[];
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type WeeklyPlanInput = {
  weekStartDate: string;
  weekEndDate: string;
  dailyUpdates?: WeeklyPlanDailyUpdate[];
};
