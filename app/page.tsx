"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import TaskForm from "@/components/TaskForm";
import TaskFilters from "@/components/TaskFilters";
import TaskList from "@/components/TaskList";
import PopupModal from "@/components/PopupModal";
import WeeklyPlanSection from "@/components/WeeklyPlanSection";
import { taskRepository } from "@/lib/storage";
import { weeklyPlanRepository } from "@/lib/weekly-plan";
import { filterTasks, canTransition, applyStatusMetadata } from "@/lib/workflow";
import { decideUserApproval, deleteUserBySuper, loginUser, logoutUser, readSessionUser, readUsers, registerUser } from "@/lib/auth";
import {
  decideTaskApproval,
  ensureTaskMetaSync,
  getVisibleTasks,
  metaForNewTask,
  readTaskMetaById,
  type TaskMetaById,
  writeTaskMetaById
} from "@/lib/task-access";
import {
  STATUSES,
  type AppUser,
  type ProjectTask,
  type TaskApprovalStatus,
  type TaskFilters as Filters,
  type TaskStatus,
  type UserRole,
  type WeeklyPlan,
  type WeeklyPlanInput
} from "@/lib/types";
import { isSuperUser } from "@/lib/super-user";

type AppTheme = "dark" | "light";

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRollbackToClientReview(from: TaskStatus, to: TaskStatus): boolean {
  const fromIndex = STATUSES.indexOf(from);
  const confirmedIndex = STATUSES.indexOf("Confirmed");
  return to === "Client Review" && fromIndex >= confirmedIndex;
}

export default function HomePage() {
  const TASKS_PER_PAGE = 25;
  const [theme, setTheme] = useState<AppTheme>("dark");
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [weeklyPlans, setWeeklyPlans] = useState<WeeklyPlan[]>([]);
  const [taskMetaById, setTaskMetaById] = useState<TaskMetaById>({});
  const [users, setUsers] = useState<AppUser[]>([]);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [activeTab, setActiveTab] = useState<"requests" | "weekly">("requests");
  const [requestTab, setRequestTab] = useState<"add" | "list">("add");
  const [listPage, setListPage] = useState(1);
  const [authTab, setAuthTab] = useState<"login" | "register">("login");

  const [loginValues, setLoginValues] = useState({ email: "", password: "" });
  const [registerValues, setRegisterValues] = useState({
    name: "",
    email: "",
    password: "",
    role: "client" as UserRole
  });

  const [pendingConfirmedUpdate, setPendingConfirmedUpdate] = useState<{
    taskId: string;
    nextStatus: TaskStatus;
    note: string;
    statusDate?: string;
    estimatedHoursOnStatus?: number;
  } | null>(null);
  const [confirmedDeliveryDate, setConfirmedDeliveryDate] = useState("");

  const [filters, setFilters] = useState<Filters>({
    status: "All",
    fromDate: "",
    toDate: "",
    query: ""
  });

  const [modalState, setModalState] = useState<{
    open: boolean;
    title: string;
    message: string;
    variant: "info" | "success" | "error" | "confirm";
    onConfirm?: () => void;
  }>({
    open: false,
    title: "",
    message: "",
    variant: "info"
  });

  const openModal = (
    title: string,
    message: string,
    variant: "info" | "success" | "error" | "confirm" = "info",
    onConfirm?: () => void
  ) => {
    setModalState({ open: true, title, message, variant, onConfirm });
  };

  const closeModal = () => {
    setModalState((prev) => ({ ...prev, open: false, onConfirm: undefined }));
  };

  const persistTasks = (next: ProjectTask[]) => {
    const previous = tasks;
    setTasks(next);
    void taskRepository.writeDelta(previous, next);
  };

  const persistTaskMeta = (next: TaskMetaById) => {
    setTaskMetaById(next);
    void writeTaskMetaById(next);
  };

  const refreshUsers = async () => {
    const nextUsers = await readUsers();
    setUsers(nextUsers);
    return nextUsers;
  };

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      const [initialTasks, initialUsers, initialWeeklyPlans] = await Promise.all([
        taskRepository.read(),
        readUsers(),
        weeklyPlanRepository.read()
      ]);
      const sessionUser = await readSessionUser(initialUsers);
      const initialMeta = await readTaskMetaById();
      const synced = ensureTaskMetaSync(initialTasks, sessionUser, initialMeta);

      if (!active) return;

      setTasks(initialTasks);
      setWeeklyPlans(initialWeeklyPlans);
      setUsers(initialUsers);
      setCurrentUser(sessionUser);
      setTaskMetaById(synced.next);
      if (synced.changed) {
        void writeTaskMetaById(synced.next);
      }
    };

    void loadData();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("project-tracker-theme");
    if (saved === "dark" || saved === "light") {
      setTheme(saved);
      return;
    }

    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(prefersDark ? "dark" : "light");
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("project-tracker-theme", theme);
  }, [theme]);

  useEffect(() => {
    const applyFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      const rtab = params.get("rtab");

      setActiveTab(tab === "weekly" ? "weekly" : "requests");
      setRequestTab(rtab === "list" ? "list" : "add");
    };

    applyFromUrl();
    window.addEventListener("popstate", applyFromUrl);
    return () => window.removeEventListener("popstate", applyFromUrl);
  }, []);

  const navigateMainTab = (tab: "requests" | "weekly") => {
    const url = tab === "weekly" ? "/?tab=weekly" : `/?tab=requests&rtab=${requestTab}`;
    window.history.pushState({}, "", url);
    setActiveTab(tab);
  };

  const navigateRequestTab = (tab: "add" | "list") => {
    const url = `/?tab=requests&rtab=${tab}`;
    window.history.pushState({}, "", url);
    setRequestTab(tab);
    setActiveTab("requests");
  };

  const visibleTasks = useMemo(() => {
    if (!currentUser) return [];
    const accessible = getVisibleTasks(tasks, taskMetaById, currentUser);
    return filterTasks(accessible, filters).sort((a, b) => b.requestedDate.localeCompare(a.requestedDate));
  }, [tasks, taskMetaById, currentUser, filters]);
  const isCurrentSuperUser = isSuperUser(currentUser);
  const canManageTasks = !!currentUser && (currentUser.role === "admin" || currentUser.role === "super_user");
  const canEditTaskByRole = (taskId: string) => {
    if (!currentUser) return false;
    if (currentUser.role === "admin" || currentUser.role === "super_user") return true;
    return taskMetaById[taskId]?.ownerUserId === currentUser.id;
  };

  const approvalByTaskId = useMemo(() => {
    const map: Record<string, TaskApprovalStatus> = {};
    for (const task of visibleTasks) {
      map[task.id] = taskMetaById[task.id]?.approvalStatus ?? "pending";
    }
    return map;
  }, [visibleTasks, taskMetaById]);

  const ownerByTaskId = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    for (const task of visibleTasks) {
      map[task.id] = taskMetaById[task.id]?.ownerUserId;
    }
    return map;
  }, [visibleTasks, taskMetaById]);

  const pendingUsers = useMemo(
    () => users.filter((user) => user.status === "pending"),
    [users]
  );

  const pendingTaskApprovals = useMemo(
    () => tasks.filter((task) => (taskMetaById[task.id]?.approvalStatus ?? "pending") === "pending"),
    [tasks, taskMetaById]
  );

  const stats = useMemo(() => {
    return STATUSES.map((status) => ({
      status,
      count: visibleTasks.filter((t) => t.status === status).length
    }));
  }, [visibleTasks]);

  const hourSummary = useMemo(() => {
    const estimated = visibleTasks.reduce((sum, task) => sum + task.estimatedHours, 0);
    const logged = visibleTasks.reduce((sum, task) => sum + task.loggedHours, 0);
    const remaining = Math.max(estimated - logged, 0);
    const completed = visibleTasks.filter((task) => task.status === "Completed" || task.status === "Handover").length;

    return { estimated, logged, remaining, completed };
  }, [visibleTasks]);

  const totalListPages = Math.max(1, Math.ceil(visibleTasks.length / TASKS_PER_PAGE));

  useEffect(() => {
    setListPage(1);
  }, [filters, currentUser?.id]);

  useEffect(() => {
    if (listPage > totalListPages) {
      setListPage(totalListPages);
    }
  }, [listPage, totalListPages]);

  const paginatedVisibleTasks = useMemo(() => {
    const page = Math.min(Math.max(listPage, 1), totalListPages);
    const start = (page - 1) * TASKS_PER_PAGE;
    return visibleTasks.slice(start, start + TASKS_PER_PAGE);
  }, [visibleTasks, listPage, totalListPages, TASKS_PER_PAGE]);

  const addTask = (values: {
    title: string;
    changePoints: string[];
    requestedDate: string;
    clientName: string;
    estimatedHours?: number;
    hourlyRate?: number;
  }) => {
    if (!currentUser) return;

    const nowIso = new Date().toISOString();
    const task: ProjectTask = {
      id: createId(),
      title: values.title.trim(),
      description: values.changePoints.join(" | "),
      changePoints: values.changePoints,
      requestedDate: values.requestedDate,
      clientName: values.clientName.trim() || undefined,
      status: "Requested",
      estimatedHours: values.estimatedHours ?? 0,
      loggedHours: 0,
      hourlyRate: values.hourlyRate,
      createdAt: nowIso,
      updatedAt: nowIso,
      history: [
        {
          id: createId(),
          status: "Requested",
          changedAt: nowIso,
          note:
            currentUser.role === "client"
              ? "Client submitted request (pending admin approval)"
              : values.estimatedHours !== undefined
                ? `Request captured with estimate ${values.estimatedHours}h`
                : "Request captured (estimate pending)"
        }
      ],
      hourRevisions: []
    };

    const nextTasks = [task, ...tasks];
    persistTasks(nextTasks);

    const nextMeta = {
      ...taskMetaById,
      [task.id]: metaForNewTask(task.id, currentUser)
    };
    persistTaskMeta(nextMeta);

    openModal(
      currentUser.role === "super_user" ? "Request Added" : "Request Submitted",
      currentUser.role === "super_user"
        ? "New change request has been added successfully."
        : "Task created. Super admin approval is required for final confirmation.",
      "success"
    );
  };

  const updateStatus = (
    taskId: string,
    nextStatus: TaskStatus,
    note: string,
    statusDate?: string,
    estimatedHoursOnStatus?: number,
    deliveryDateOverride?: string
  ) => {
    if (!canManageTasks || !currentUser) {
      openModal("Access Denied", "Only admin/super user can update workflow status.", "error");
      return;
    }

    const target = tasks.find((task) => task.id === taskId);
    if (!target) return;
    if (!canEditTaskByRole(taskId)) {
      openModal("Access Denied", "You do not have permission to edit this task.", "error");
      return;
    }
    const isRollback = isRollbackToClientReview(target.status, nextStatus);

    if (!canTransition(target.status, nextStatus)) {
      openModal(
        "Invalid Workflow",
        "Only same step, next step, or rollback to Client Review from Confirmed+ is allowed.",
        "error"
      );
      return;
    }

    if (isRollback && !note.trim()) {
      openModal("Reason Required", "Please add a rollback reason in Status Note.", "error");
      return;
    }

    const isTransition = target.status !== nextStatus;
    const needsDateFromPrompt = nextStatus === "Confirmed" && !target.deliveryDate && !deliveryDateOverride;
    if (isTransition && !statusDate && !needsDateFromPrompt) {
      openModal("Status Date Required", "Please select Status Date when changing status.", "error");
      return;
    }

    const requiresEstimate = ["Confirmed", "Approved", "Working On It", "Completed", "Handover"].includes(nextStatus);
    const effectiveEstimate = estimatedHoursOnStatus ?? target.estimatedHours;
    if (requiresEstimate && (!Number.isFinite(effectiveEstimate) || effectiveEstimate <= 0)) {
      openModal(
        "Estimated Time Required",
        "Please set Estimated Hours before moving to Confirmed or later statuses.",
        "error"
      );
      return;
    }

    const commitStatus = (deliveryDateOverride?: string) => {
      const nowIso = new Date().toISOString();

      const next = tasks.map((task) => {
        if (task.id !== taskId) return task;

        const effectiveStatusDate = statusDate || deliveryDateOverride;
        const nextEstimated = isRollback ? 0 : effectiveEstimate;
        const hourRevisions = [...task.hourRevisions];
        if (task.estimatedHours !== nextEstimated) {
          hourRevisions.push({
            id: createId(),
            previousEstimatedHours: task.estimatedHours,
            nextEstimatedHours: nextEstimated,
            changedAt: nowIso,
            reason: isRollback ? note.trim() || "Rollback to Client Review" : "Status update"
          });
        }

        const deliveryDate =
          isRollback
            ? undefined
            : nextStatus === "Confirmed"
              ? deliveryDateOverride || task.deliveryDate
              : task.deliveryDate;

        const updated: ProjectTask = {
          ...task,
          status: nextStatus,
          estimatedHours: nextEstimated,
          deliveryDate,
          clientReviewDate: isRollback ? effectiveStatusDate : task.clientReviewDate,
          confirmedDate: isRollback ? undefined : task.confirmedDate,
          approvedDate: isRollback ? undefined : task.approvedDate,
          startDate: isRollback ? undefined : task.startDate,
          completedDate: isRollback ? undefined : task.completedDate,
          handoverDate: isRollback ? undefined : task.handoverDate,
          updatedAt: nowIso,
          hourRevisions,
          history: [
            ...task.history,
            {
              id: createId(),
              status: nextStatus,
              changedAt: nowIso,
              note: `${note || ""}${effectiveStatusDate ? `${note ? " | " : ""}Status date: ${effectiveStatusDate}` : ""}` || undefined
            }
          ]
        };

        return applyStatusMetadata(updated, nextStatus, effectiveStatusDate);
      });

      persistTasks(next);

      const currentMeta = taskMetaById[taskId];
      if (currentMeta) {
        const nextMeta = decideTaskApproval(currentMeta, currentUser, true, "Workflow updated by manager");
        persistTaskMeta({
          ...taskMetaById,
          [taskId]: nextMeta
        });
      }

      openModal("Status Updated", "Request status has been updated.", "success");
    };

    if (nextStatus === "Confirmed" && !target.deliveryDate) {
      setPendingConfirmedUpdate({ taskId, nextStatus, note, statusDate, estimatedHoursOnStatus: effectiveEstimate });
      setConfirmedDeliveryDate(statusDate || "");
      return;
    }

    commitStatus();
  };

  const confirmPendingConfirmedStatus = () => {
    if (!pendingConfirmedUpdate) return;
    if (!confirmedDeliveryDate) {
      openModal("Delivery Date Required", "Please select Delivery Date to confirm this request.", "error");
      return;
    }

    updateStatus(
      pendingConfirmedUpdate.taskId,
      pendingConfirmedUpdate.nextStatus,
      pendingConfirmedUpdate.note,
      pendingConfirmedUpdate.statusDate || confirmedDeliveryDate,
      pendingConfirmedUpdate.estimatedHoursOnStatus,
      confirmedDeliveryDate
    );
    setPendingConfirmedUpdate(null);
    setConfirmedDeliveryDate("");
  };

  const updateHours = (
    taskId: string,
    payload: {
      estimatedHours: number;
      loggedHours: number;
      hourlyRate?: number;
      reason?: string;
    }
  ) => {
    if (!canManageTasks || !currentUser) {
      openModal("Access Denied", "Only admin/super user can update hours.", "error");
      return;
    }

    if (payload.estimatedHours < 0 || payload.loggedHours < 0) {
      openModal("Invalid Hours", "Hours cannot be negative.", "error");
      return;
    }

    const next = tasks.map((task) => {
      if (task.id !== taskId) return task;

      const nowIso = new Date().toISOString();
      const history = [...task.history];
      const hourRevisions = [...task.hourRevisions];

      if (task.estimatedHours !== payload.estimatedHours) {
        hourRevisions.push({
          id: createId(),
          previousEstimatedHours: task.estimatedHours,
          nextEstimatedHours: payload.estimatedHours,
          changedAt: nowIso,
          reason: payload.reason
        });
      }

      history.push({
        id: createId(),
        status: task.status,
        changedAt: nowIso,
        note: `Hours updated: estimate ${payload.estimatedHours}h, logged ${payload.loggedHours}h${
          payload.reason ? ` (${payload.reason})` : ""
        }`
      });

      return {
        ...task,
        estimatedHours: payload.estimatedHours,
        loggedHours: payload.loggedHours,
        hourlyRate: payload.hourlyRate,
        updatedAt: nowIso,
        history,
        hourRevisions
      };
    });

    persistTasks(next);
    openModal("Hours Updated", "Estimated/logged hours were saved successfully.", "success");
  };

  const updateTask = (
    taskId: string,
    payload: {
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
    }
  ) => {
    if (!currentUser) {
      openModal("Access Denied", "Please login first.", "error");
      return;
    }

    const target = tasks.find((task) => task.id === taskId);
    if (!target) return;

    if (!canEditTaskByRole(taskId)) {
      openModal("Access Denied", "You do not have permission to edit this task.", "error");
      return;
    }
    const targetMeta = taskMetaById[taskId];

    if (currentUser.role === "client") {
      const nowIso = new Date().toISOString();
      const next = tasks.map((task) => {
        if (task.id !== taskId) return task;

        return {
          ...task,
          title: payload.title,
          clientName: payload.clientName,
          requestedDate: payload.requestedDate,
          changePoints: payload.changePoints,
          description: payload.changePoints.join(" | "),
          updatedAt: nowIso,
          history: [
            ...task.history,
            {
              id: createId(),
              status: task.status,
              changedAt: nowIso,
              note: "Client edited request and submitted for admin approval"
            }
          ]
        };
      });

      persistTasks(next);
      if (targetMeta) {
        persistTaskMeta({
          ...taskMetaById,
          [taskId]: {
            ...targetMeta,
            approvalStatus: "pending",
            decisionNote: undefined,
            decidedByUserId: undefined,
            decidedAt: undefined,
            updatedAt: nowIso
          }
        });
      }
      openModal("Submitted", "Changes submitted. Waiting for admin approval.", "success");
      return;
    }

    const statusIndex = (status: TaskStatus) => STATUSES.indexOf(status);
    const isRollback = isRollbackToClientReview(target.status, payload.status);

    if (!canTransition(target.status, payload.status)) {
      openModal(
        "Invalid Workflow",
        "Only same step, next step, or rollback to Client Review from Confirmed+ is allowed.",
        "error"
      );
      return;
    }

    if (isRollback && !(payload.hourReason || "").trim()) {
      openModal("Reason Required", "Please provide reason before rolling back to Client Review.", "error");
      return;
    }

    if (payload.loggedHours < 0 || payload.estimatedHours < 0) {
      openModal("Invalid Hours", "Estimated and logged hours cannot be negative.", "error");
      return;
    }

    const requiresEstimate = ["Confirmed", "Approved", "Working On It", "Completed", "Handover"].includes(payload.status);
    if (requiresEstimate && payload.estimatedHours <= 0) {
      openModal("Estimated Time Required", "Please set estimated hours before moving to this status.", "error");
      return;
    }

    if (payload.status === "Confirmed" && !payload.deliveryDate) {
      openModal("Delivery Date Required", "Please set delivery date before saving Confirmed status.", "error");
      return;
    }

    const transitionDateByStatus: Partial<Record<TaskStatus, string | undefined>> = {
      "Client Review": payload.clientReviewDate,
      Confirmed: payload.confirmedDate,
      Approved: payload.approvedDate,
      "Working On It": payload.startDate,
      Completed: payload.completedDate,
      Handover: payload.handoverDate
    };
    const transitionDate = transitionDateByStatus[payload.status];

    if (target.status !== payload.status && !transitionDate) {
      openModal("Status Date Required", `Please set ${payload.status} date when changing status.`, "error");
      return;
    }

    const next = tasks.map((task) => {
      if (task.id !== taskId) return task;

      const nowIso = new Date().toISOString();
      const nextEstimated = isRollback ? 0 : payload.estimatedHours;
      const currentIndex = statusIndex(payload.status);
      const clientReviewDate = currentIndex >= statusIndex("Client Review") ? payload.clientReviewDate : undefined;
      const startDate = currentIndex >= statusIndex("Working On It") ? payload.startDate : undefined;
      const confirmedDate = currentIndex >= statusIndex("Confirmed") ? payload.confirmedDate : undefined;
      const approvedDate = currentIndex >= statusIndex("Approved") ? payload.approvedDate : undefined;
      const completedDate = currentIndex >= statusIndex("Completed") ? payload.completedDate : undefined;
      const handoverDate = currentIndex >= statusIndex("Handover") ? payload.handoverDate : undefined;

      const history = [...task.history];
      const hourRevisions = [...task.hourRevisions];

      if (task.estimatedHours !== nextEstimated) {
        hourRevisions.push({
          id: createId(),
          previousEstimatedHours: task.estimatedHours,
          nextEstimatedHours: nextEstimated,
          changedAt: nowIso,
          reason: payload.hourReason || (isRollback ? "Rollback to Client Review" : undefined)
        });
      }

      history.push({
        id: createId(),
        status: payload.status,
        changedAt: nowIso,
        note: `Request edited${transitionDate ? ` | ${payload.status} date: ${transitionDate}` : ""}${payload.hourReason ? ` | ${payload.hourReason}` : ""}`
      });

      const updated: ProjectTask = {
        ...task,
        title: payload.title,
        clientName: payload.clientName,
        requestedDate: payload.requestedDate,
        changePoints: payload.changePoints,
        description: payload.changePoints.join(" | "),
        status: payload.status,
        estimatedHours: nextEstimated,
        loggedHours: payload.loggedHours,
        hourlyRate: payload.hourlyRate,
        deliveryDate: isRollback ? undefined : payload.deliveryDate,
        clientReviewDate: isRollback ? transitionDate : clientReviewDate,
        startDate: isRollback ? undefined : startDate,
        confirmedDate: isRollback ? undefined : confirmedDate,
        approvedDate: isRollback ? undefined : approvedDate,
        completedDate: isRollback ? undefined : completedDate,
        handoverDate: isRollback ? undefined : handoverDate,
        updatedAt: nowIso,
        history,
        hourRevisions
      };

      return applyStatusMetadata(updated, payload.status, transitionDate);
    });

    persistTasks(next);

    const existingMeta = taskMetaById[taskId];
    if (existingMeta) {
      const nextMeta = decideTaskApproval(
        existingMeta,
        currentUser,
        true,
        currentUser.role === "super_user" ? "Reviewed and saved by super user" : "Reviewed and saved by admin"
      );
      persistTaskMeta({
        ...taskMetaById,
        [taskId]: nextMeta
      });
    }

    openModal("Request Updated", "Request details were updated successfully.", "success");
  };

  const requestDeleteTask = (taskId: string) => {
    if (!currentUser || !isCurrentSuperUser) {
      openModal("Access Denied", "Only super user can delete requests.", "error");
      return;
    }

    const nextTasks = tasks.filter((task) => task.id !== taskId);
    persistTasks(nextTasks);

    const nextMeta = { ...taskMetaById };
    delete nextMeta[taskId];
    persistTaskMeta(nextMeta);

    openModal("Deleted", "Request has been deleted.", "success");
  };

  const handleUserDecision = async (userId: string, approve: boolean) => {
    if (!currentUser || !isCurrentSuperUser) {
      openModal("Access Denied", "Only super user can approve/reject users.", "error");
      return;
    }
    const result = await decideUserApproval({ actor: currentUser, userId, approve });
    if (!result.ok) {
      openModal("Approval Failed", result.message, "error");
      return;
    }

    setUsers(result.users);
    openModal("User Updated", result.message, "success");
  };

  const handleTaskDecision = (taskId: string, approve: boolean) => {
    if (!currentUser || !isCurrentSuperUser) {
      openModal("Access Denied", "Only super user can approve/reject tasks.", "error");
      return;
    }

    const targetMeta = taskMetaById[taskId];
    if (!targetMeta) {
      openModal("Not Found", "Task metadata not found.", "error");
      return;
    }

    const nextMeta = {
      ...taskMetaById,
      [taskId]: decideTaskApproval(
        targetMeta,
        currentUser,
        approve,
        approve ? "Task approved by admin" : "Task rejected by admin"
      )
    };

    persistTaskMeta(nextMeta);

    if (!approve) {
      const nowIso = new Date().toISOString();
      const nextTasks = tasks.map((task) => {
        if (task.id !== taskId) return task;
        return {
          ...task,
          history: [
            ...task.history,
            {
              id: createId(),
              status: task.status,
              changedAt: nowIso,
              note: "Task rejected by admin"
            }
          ],
          updatedAt: nowIso
        };
      });
      persistTasks(nextTasks);
    }

    openModal("Task Decision Saved", approve ? "Task approved successfully." : "Task rejected successfully.", "success");
  };

  const handleDeleteUser = async (userId: string) => {
    if (!currentUser || !isCurrentSuperUser) {
      openModal("Access Denied", "Only super user can delete users.", "error");
      return;
    }

    const result = await deleteUserBySuper({ actor: currentUser, targetUserId: userId });
    if (!result.ok) {
      openModal("Delete Failed", result.message, "error");
      return;
    }

    setUsers(result.users);
    openModal("User Deleted", result.message, "success");
  };

  const handleWeeklyPlanCreate = async (input: WeeklyPlanInput) => {
    if (!currentUser || !isCurrentSuperUser) {
      openModal("Access Denied", "Only super user can manage weekly plans.", "error");
      return;
    }

    try {
      const created = await weeklyPlanRepository.create({
        ...input,
        id: createId(),
        createdByUserId: currentUser.id
      });

      setWeeklyPlans((prev) => [created, ...prev]);
      openModal("Weekly Plan Created", "Product manager weekly plan has been saved.", "success");
    } catch (error) {
      openModal("Save Failed", error instanceof Error ? error.message : "Could not save weekly plan to database.", "error");
    }
  };

  const handleWeeklyPlanUpdate = async (planId: string, input: WeeklyPlanInput) => {
    if (!currentUser || !isCurrentSuperUser) {
      openModal("Access Denied", "Only super user can manage weekly plans.", "error");
      return;
    }

    try {
      const updated = await weeklyPlanRepository.update(planId, input);
      if (!updated) {
        openModal("Not Found", "Weekly plan record was not found.", "error");
        return;
      }

      setWeeklyPlans((prev) => prev.map((plan) => (plan.id === planId ? updated : plan)));
      openModal("Weekly Plan Updated", "Weekly plan has been updated.", "success");
    } catch (error) {
      openModal("Update Failed", error instanceof Error ? error.message : "Could not update weekly plan in database.", "error");
    }
  };

  const handleWeeklyPlanDelete = async (planId: string) => {
    if (!currentUser || !isCurrentSuperUser) {
      openModal("Access Denied", "Only super user can manage weekly plans.", "error");
      return;
    }

    try {
      await weeklyPlanRepository.remove(planId);
      setWeeklyPlans((prev) => prev.filter((plan) => plan.id !== planId));
      openModal("Weekly Plan Deleted", "Weekly plan has been deleted.", "success");
    } catch (error) {
      openModal("Delete Failed", error instanceof Error ? error.message : "Could not delete weekly plan from database.", "error");
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const result = await loginUser(loginValues);
    if (!result.ok) {
      openModal("Login Failed", result.message, "error");
      return;
    }

    setCurrentUser(result.user);
    void refreshUsers();
    setLoginValues({ email: "", password: "" });

    const synced = ensureTaskMetaSync(tasks, result.user, taskMetaById);
    if (synced.changed) {
      persistTaskMeta(synced.next);
    }

    openModal("Login Success", `Welcome, ${result.user.name}.`, "success");
  };

  const handleRegisterSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const result = await registerUser(registerValues);
    if (!result.ok) {
      openModal("Registration Failed", result.message, "error");
      return;
    }

    const nextUsers = await refreshUsers();

    if (result.user.status === "approved") {
      setCurrentUser(result.user);
      const synced = ensureTaskMetaSync(tasks, result.user, taskMetaById);
      if (synced.changed) {
        persistTaskMeta(synced.next);
      }
    }

    setRegisterValues({ name: "", email: "", password: "", role: "client" });
    setAuthTab("login");

    openModal(
      "Registration Submitted",
      result.message,
      "success"
    );
  };

  const handleLogout = () => {
    logoutUser();
    setCurrentUser(null);
    setPendingConfirmedUpdate(null);
    setConfirmedDeliveryDate("");
    openModal("Logged Out", "You have been logged out.", "info");
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  if (!currentUser) {
    return (
      <main className="page auth-page">
        <section className="card stack">
          <div className="row between">
            <small className="muted">Appearance</small>
            <button type="button" className="secondary theme-toggle" onClick={toggleTheme}>
              {theme === "dark" ? "Light Mode" : "Dark Mode"}
            </button>
          </div>
          <h1>Project Tracker</h1>
          <p className="muted">Register as Admin or Client. New accounts need admin approval (except first bootstrap admin).</p>

          <div className="tab-header">
            <button
              type="button"
              className={authTab === "login" ? "tab-btn active" : "tab-btn"}
              onClick={() => setAuthTab("login")}
            >
              Login
            </button>
            <button
              type="button"
              className={authTab === "register" ? "tab-btn active" : "tab-btn"}
              onClick={() => setAuthTab("register")}
            >
              Register
            </button>
          </div>

          {authTab === "login" ? (
            <form className="stack" onSubmit={handleLoginSubmit}>
              <label>
                Email
                <input
                  type="email"
                  value={loginValues.email}
                  onChange={(e) => setLoginValues((prev) => ({ ...prev, email: e.target.value }))}
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={loginValues.password}
                  onChange={(e) => setLoginValues((prev) => ({ ...prev, password: e.target.value }))}
                />
              </label>
              <div>
                <button type="submit">Login</button>
              </div>
            </form>
          ) : (
            <form className="stack" onSubmit={handleRegisterSubmit}>
              <div className="grid two">
                <label>
                  Name
                  <input
                    value={registerValues.name}
                    onChange={(e) => setRegisterValues((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={registerValues.email}
                    onChange={(e) => setRegisterValues((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </label>
              </div>
              <div className="grid two">
                <label>
                  Password
                  <input
                    type="password"
                    value={registerValues.password}
                    onChange={(e) => setRegisterValues((prev) => ({ ...prev, password: e.target.value }))}
                  />
                </label>
                <label>
                  Register As
                  <select
                    value={registerValues.role}
                    onChange={(e) => setRegisterValues((prev) => ({ ...prev, role: e.target.value as UserRole }))}
                  >
                    <option value="admin">Admin</option>
                    <option value="client">Client</option>
                  </select>
                </label>
              </div>
              <div>
                <button type="submit">Submit Registration</button>
              </div>
            </form>
          )}
        </section>

        <PopupModal
          open={modalState.open}
          title={modalState.title}
          message={modalState.message}
          variant={modalState.variant}
          onClose={closeModal}
          onConfirm={modalState.onConfirm}
          confirmLabel={modalState.variant === "confirm" ? "Delete" : "OK"}
        />
      </main>
    );
  }

  return (
    <main className="page dashboard-shell">
      <aside className="dashboard-sidebar card">
        <div className="brand-panel">
          <p className="brand-title">PTA Console</p>
          <small>
            {isCurrentSuperUser
              ? "Super User Mode"
              : currentUser.role === "admin"
                ? "Admin Mode"
                : "Client Mode"}
          </small>
        </div>
        <div className="stack">
          <div className="sidebar-metric">
            <small>Logged User</small>
            <strong>{currentUser.name}</strong>
          </div>
          <div className="sidebar-metric">
            <small>Total Requests</small>
            <strong>{visibleTasks.length}</strong>
          </div>
          <div className="sidebar-metric">
            <small>Pending Work</small>
            <strong>{hourSummary.remaining}h</strong>
          </div>
          <div className="sidebar-metric">
            <small>Completed</small>
            <strong>{hourSummary.completed}</strong>
          </div>
        </div>
        <div className="sidebar-actions stack">
          {isCurrentSuperUser ? (
            <Link href="/super/users" className="button-link secondary-link">
              Super Users Page
            </Link>
          ) : null}
          <button className="secondary" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </aside>

      <section className="dashboard-main stack">
        <section className="hero card">
          <div className="hero-copy">
            <h1>Project Tracker</h1>
            <p>
              {isCurrentSuperUser
                ? "Super user can approve/reject users, approve tasks, and delete any admin/user."
                : currentUser.role === "admin" || currentUser.role === "super_user"
                  ? "Add your own requests and approve pending client requests."
                  : "Add requests, view all requests, and edit only your own requests."}
            </p>
          </div>
          <div className="status-lamp">
            <span className="lamp online" />
            <small>System Online</small>
            <button type="button" className="secondary theme-toggle" onClick={toggleTheme}>
              {theme === "dark" ? "Light Mode" : "Dark Mode"}
            </button>
          </div>
        </section>

        <section className="kpi-grid">
          <div className="card kpi">
            <small>Total Requests</small>
            <h2>{visibleTasks.length}</h2>
          </div>
          <div className="card kpi">
            <small>Estimated Hours</small>
            <h2>{hourSummary.estimated}</h2>
          </div>
          <div className="card kpi">
            <small>Logged Hours</small>
            <h2>{hourSummary.logged}</h2>
          </div>
          <div className="card kpi">
            <small>Remaining Hours</small>
            <h2>{hourSummary.remaining}</h2>
          </div>
          <div className="card kpi">
            <small>Done / Handover</small>
            <h2>{hourSummary.completed}</h2>
          </div>
        </section>

        <section className="stats">
          {stats.map((item) => (
            <div className="card status-card" key={item.status}>
              <small>{item.status}</small>
              <h2>{item.count}</h2>
            </div>
          ))}
        </section>

        <section className="tab-shell card">
          <div className="tab-header">
            <button
              type="button"
              className={activeTab === "requests" ? "tab-btn active" : "tab-btn"}
              onClick={() => navigateMainTab("requests")}
            >
              Requests
            </button>
            {isCurrentSuperUser ? (
              <button
                type="button"
                className={activeTab === "weekly" ? "tab-btn active" : "tab-btn"}
                onClick={() => navigateMainTab("weekly")}
              >
                Weekly Plans
              </button>
            ) : null}
          </div>

          {activeTab === "requests" ? (
            <div className="stack">
              <div className="tab-header">
                <button
                  type="button"
                  className={requestTab === "add" ? "tab-btn active" : "tab-btn"}
                  onClick={() => navigateRequestTab("add")}
                >
                  Add Request
                </button>
                <button
                  type="button"
                  className={requestTab === "list" ? "tab-btn active" : "tab-btn"}
                  onClick={() => navigateRequestTab("list")}
                >
                  Request List
                </button>
              </div>

              {requestTab === "add" ? (
                <TaskForm onSubmit={addTask} onNotify={openModal} />
              ) : (
                <>
                  <TaskFilters filters={filters} onChange={setFilters} />
                  <div className="row between gap">
                    <small className="muted">
                      Showing {paginatedVisibleTasks.length} of {visibleTasks.length} requests
                    </small>
                    <div className="row gap">
                      <button
                        type="button"
                        className="secondary"
                        disabled={listPage <= 1}
                        onClick={() => setListPage((prev) => Math.max(prev - 1, 1))}
                      >
                        Prev
                      </button>
                      <small className="muted">
                        Page {totalListPages === 0 ? 0 : listPage} / {totalListPages}
                      </small>
                      <button
                        type="button"
                        className="secondary"
                        disabled={listPage >= totalListPages}
                        onClick={() => setListPage((prev) => Math.min(prev + 1, totalListPages))}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                  <TaskList
                    tasks={paginatedVisibleTasks}
                    viewerRole={currentUser.role}
                    viewerUserId={currentUser.id}
                    ownerByTaskId={ownerByTaskId}
                    approvalByTaskId={approvalByTaskId}
                    onTaskUpdate={updateTask}
                    onRequestDelete={requestDeleteTask}
                    onNotify={openModal}
                  />
                </>
              )}
            </div>
          ) : isCurrentSuperUser ? (
            <WeeklyPlanSection
              plans={weeklyPlans}
              onCreate={handleWeeklyPlanCreate}
              onUpdate={handleWeeklyPlanUpdate}
              onDelete={handleWeeklyPlanDelete}
              onNotify={openModal}
            />
          ) : (
            <div className="card">Access denied.</div>
          )}
        </section>
      </section>

      <PopupModal
        open={pendingConfirmedUpdate !== null}
        title="Delivery Date Required"
        message="To set status to Confirmed, please provide the delivery date."
        variant="confirm"
        confirmLabel="Confirm Status"
        confirmDisabled={!confirmedDeliveryDate}
        confirmOrder="confirm-first"
        onClose={() => {
          setPendingConfirmedUpdate(null);
          setConfirmedDeliveryDate("");
        }}
        onConfirm={confirmPendingConfirmedStatus}
      >
        <label>
          Delivery Date
          <input
            type="date"
            value={confirmedDeliveryDate}
            onChange={(e) => setConfirmedDeliveryDate(e.target.value)}
          />
        </label>
      </PopupModal>

      <PopupModal
        open={modalState.open}
        title={modalState.title}
        message={modalState.message}
        variant={modalState.variant}
        onClose={closeModal}
        onConfirm={modalState.onConfirm}
        confirmLabel={modalState.variant === "confirm" ? "Delete" : "OK"}
      />
    </main>
  );
}
