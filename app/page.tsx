"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import TaskForm from "@/components/TaskForm";
import TaskFilters from "@/components/TaskFilters";
import TaskList from "@/components/TaskList";
import PopupModal from "@/components/PopupModal";
import { taskRepository, exportTasks, importTasks } from "@/lib/storage";
import { filterTasks, canTransition, applyStatusMetadata } from "@/lib/workflow";
import { decideUserApproval, loginUser, logoutUser, readSessionUser, readUsers, registerUser } from "@/lib/auth";
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
  type UserRole
} from "@/lib/types";
import { isSuperUser } from "@/lib/super-user";

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRollbackToClientReview(from: TaskStatus, to: TaskStatus): boolean {
  const fromIndex = STATUSES.indexOf(from);
  const confirmedIndex = STATUSES.indexOf("Confirmed");
  return to === "Client Review" && fromIndex >= confirmedIndex;
}

export default function HomePage() {
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [taskMetaById, setTaskMetaById] = useState<TaskMetaById>({});
  const [users, setUsers] = useState<AppUser[]>([]);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<"add" | "list">("add");
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
    setTasks(next);
    void taskRepository.write(next);
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
      const [initialTasks, initialUsers] = await Promise.all([taskRepository.read(), readUsers()]);
      const sessionUser = await readSessionUser(initialUsers);
      const initialMeta = await readTaskMetaById();
      const synced = ensureTaskMetaSync(initialTasks, sessionUser, initialMeta);

      if (!active) return;

      setTasks(initialTasks);
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
    const applyFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      setActiveTab(params.get("tab") === "list" ? "list" : "add");
    };

    applyFromUrl();
    window.addEventListener("popstate", applyFromUrl);
    return () => window.removeEventListener("popstate", applyFromUrl);
  }, []);

  const navigateTab = (tab: "add" | "list") => {
    const url = tab === "list" ? "/?tab=list" : "/?tab=add";
    window.history.pushState({}, "", url);
    setActiveTab(tab);
  };

  const visibleTasks = useMemo(() => {
    if (!currentUser) return [];
    const accessible = getVisibleTasks(tasks, taskMetaById, currentUser);
    return filterTasks(accessible, filters).sort((a, b) => b.requestedDate.localeCompare(a.requestedDate));
  }, [tasks, taskMetaById, currentUser, filters]);
  const isCurrentSuperUser = isSuperUser(currentUser);
  const canManageTasks = !!currentUser && (currentUser.role === "admin" || currentUser.role === "super_user");

  const approvalByTaskId = useMemo(() => {
    const map: Record<string, TaskApprovalStatus> = {};
    for (const task of visibleTasks) {
      map[task.id] = taskMetaById[task.id]?.approvalStatus ?? "pending";
    }
    return map;
  }, [visibleTasks, taskMetaById]);

  const pendingUsers = useMemo(
    () => users.filter((user) => user.status === "pending"),
    [users]
  );

  const pendingTaskApprovals = useMemo(
    () => tasks.filter((task) => taskMetaById[task.id]?.approvalStatus === "pending"),
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
      currentUser.role === "client" ? "Request Submitted" : "Request Added",
      currentUser.role === "client"
        ? "Task created. Admin approval is required for final confirmation."
        : "New change request has been added successfully.",
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
        const nextMeta = isCurrentSuperUser
          ? decideTaskApproval(currentMeta, currentUser, true, "Workflow updated by super user")
          : {
              ...currentMeta,
              approvalStatus: "pending" as const,
              decisionNote: undefined,
              decidedByUserId: undefined,
              decidedAt: undefined,
              updatedAt: new Date().toISOString()
            };
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
      statusDate?: string;
      estimatedHours: number;
      loggedHours: number;
      hourlyRate?: number;
      hourReason?: string;
      deliveryDate?: string;
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

    const targetMeta = taskMetaById[taskId];
    if (currentUser.role === "client" && targetMeta?.ownerUserId !== currentUser.id) {
      openModal("Access Denied", "You can edit only your own tasks.", "error");
      return;
    }

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

    if (target.status !== payload.status && !payload.statusDate) {
      openModal("Status Date Required", "Please set status date when changing status.", "error");
      return;
    }

    const next = tasks.map((task) => {
      if (task.id !== taskId) return task;

      const nowIso = new Date().toISOString();
      const statusDate = payload.statusDate;
      const nextEstimated = isRollback ? 0 : payload.estimatedHours;
      const currentIndex = statusIndex(payload.status);
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
        note: `Request edited${statusDate ? ` | Status date: ${statusDate}` : ""}${payload.hourReason ? ` | ${payload.hourReason}` : ""}`
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
        confirmedDate: isRollback ? undefined : confirmedDate,
        approvedDate: isRollback ? undefined : approvedDate,
        startDate: isRollback ? undefined : task.startDate,
        completedDate: isRollback ? undefined : completedDate,
        handoverDate: isRollback ? undefined : handoverDate,
        updatedAt: nowIso,
        history,
        hourRevisions
      };

      return applyStatusMetadata(updated, payload.status, statusDate);
    });

    persistTasks(next);

    const existingMeta = taskMetaById[taskId];
    if (existingMeta) {
      const nextMeta = isCurrentSuperUser
        ? decideTaskApproval(existingMeta, currentUser, true, "Reviewed and saved by super user")
        : {
            ...existingMeta,
            approvalStatus: "pending" as const,
            decisionNote: undefined,
            decidedByUserId: undefined,
            decidedAt: undefined,
            updatedAt: new Date().toISOString()
          };
      persistTaskMeta({
        ...taskMetaById,
        [taskId]: nextMeta
      });
    }

    openModal("Request Updated", "Request details were updated successfully.", "success");
  };

  const requestDeleteTask = (taskId: string) => {
    if (!canManageTasks) {
      openModal("Access Denied", "Only admin/super user can delete requests.", "error");
      return;
    }

    const nextTasks = tasks.filter((task) => task.id !== taskId);
    persistTasks(nextTasks);

    const nextMeta = { ...taskMetaById };
    delete nextMeta[taskId];
    persistTaskMeta(nextMeta);

    openModal("Deleted", "Request has been deleted.", "success");
  };

  const handleExport = () => {
    const source = canManageTasks ? tasks : visibleTasks;
    const blob = new Blob([exportTasks(source)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `project-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    if (!canManageTasks) {
      openModal("Access Denied", "Only admin/super user can import data.", "error");
      return;
    }

    fileInputRef.current?.click();
  };

  const handleImportFile = async (file?: File) => {
    if (!canManageTasks) {
      openModal("Access Denied", "Only admin/super user can import data.", "error");
      return;
    }

    if (!file) return;
    const text = await file.text();
    try {
      const parsed = importTasks(text);
      persistTasks(parsed);

      const synced = ensureTaskMetaSync(parsed, currentUser, taskMetaById);
      persistTaskMeta(synced.next);

      openModal("Import Complete", "JSON data imported successfully.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not import JSON";
      openModal("Import Failed", message, "error");
    }
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

  if (!currentUser) {
    return (
      <main className="page auth-page">
        <section className="card stack">
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
          <button onClick={handleExport}>Export JSON</button>
          <button className="secondary" onClick={handleImportClick} disabled={!canManageTasks}>
            Import JSON
          </button>
          {isCurrentSuperUser ? (
            <Link href="/super/users" className="button-link secondary-link">
              Super Users Page
            </Link>
          ) : null}
          <button className="secondary" onClick={handleLogout}>
            Logout
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => handleImportFile(e.target.files?.[0])}
          />
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
                  ? "Manage workflow and requests. Super user handles user/task approvals."
                  : "Create and edit your requests. Admin will approve final task changes."}
            </p>
          </div>
          <div className="status-lamp">
            <span className="lamp online" />
            <small>System Online</small>
          </div>
        </section>

        {isCurrentSuperUser ? (
          <section className="approval-grid">
            <div className="card stack">
              <h2>User Approval Queue</h2>
              {pendingUsers.length === 0 ? (
                <p className="muted">No pending users.</p>
              ) : (
                <div className="stack">
                  {pendingUsers.map((user) => (
                    <div key={user.id} className="approval-item">
                      <div>
                        <strong>{user.name}</strong>
                        <div className="muted">{user.email}</div>
                        <div className="muted">Role: {user.role}</div>
                      </div>
                      <div className="row gap">
                        <button type="button" onClick={() => handleUserDecision(user.id, true)}>
                          Approve
                        </button>
                        <button type="button" className="danger" onClick={() => handleUserDecision(user.id, false)}>
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card stack">
              <h2>Task Approval Queue</h2>
              {pendingTaskApprovals.length === 0 ? (
                <p className="muted">No pending task approvals.</p>
              ) : (
                <div className="stack">
                  {pendingTaskApprovals.map((task) => {
                    const ownerId = taskMetaById[task.id]?.ownerUserId;
                    const owner = users.find((user) => user.id === ownerId);

                    return (
                      <div key={task.id} className="approval-item">
                        <div>
                          <strong>{task.title}</strong>
                          <div className="muted">Owner: {owner?.name || "Unknown"}</div>
                          <div className="muted">Status: {task.status}</div>
                        </div>
                        <div className="row gap">
                          <button type="button" onClick={() => handleTaskDecision(task.id, true)}>
                            Approve
                          </button>
                          <button type="button" className="danger" onClick={() => handleTaskDecision(task.id, false)}>
                            Reject
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        ) : null}

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
              className={activeTab === "add" ? "tab-btn active" : "tab-btn"}
              onClick={() => navigateTab("add")}
            >
              Add Request
            </button>
            <button
              type="button"
              className={activeTab === "list" ? "tab-btn active" : "tab-btn"}
              onClick={() => navigateTab("list")}
            >
              Request List
            </button>
          </div>

          {activeTab === "add" ? (
            <TaskForm onSubmit={addTask} onNotify={openModal} />
          ) : (
            <div className="stack">
              <TaskFilters filters={filters} onChange={setFilters} />
              <TaskList
                tasks={visibleTasks}
                viewerRole={currentUser.role}
                approvalByTaskId={approvalByTaskId}
                onTaskUpdate={updateTask}
                onRequestDelete={requestDeleteTask}
                onNotify={openModal}
              />
            </div>
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
