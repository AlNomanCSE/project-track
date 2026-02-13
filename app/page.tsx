"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import TaskForm from "@/components/TaskForm";
import TaskFilters from "@/components/TaskFilters";
import TaskList from "@/components/TaskList";
import PopupModal from "@/components/PopupModal";
import { taskRepository, exportTasks, importTasks } from "@/lib/storage";
import { filterTasks, canTransition, applyStatusMetadata } from "@/lib/workflow";
import { STATUSES, type ProjectTask, type TaskFilters as Filters, type TaskStatus } from "@/lib/types";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<"add" | "list">("add");
  const [pendingConfirmedUpdate, setPendingConfirmedUpdate] = useState<{
    taskId: string;
    nextStatus: TaskStatus;
    note: string;
    statusDate?: string;
    estimatedHoursOnStatus?: number;
  } | null>(null);
  const [confirmedDeliveryDate, setConfirmedDeliveryDate] = useState("");
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

  const [filters, setFilters] = useState<Filters>({
    status: "All",
    fromDate: "",
    toDate: "",
    query: ""
  });

  const filtered = useMemo(
    () => filterTasks(tasks, filters).sort((a, b) => b.requestedDate.localeCompare(a.requestedDate)),
    [tasks, filters]
  );

  const stats = useMemo(() => {
    return STATUSES.map((status) => ({
      status,
      count: tasks.filter((t) => t.status === status).length
    }));
  }, [tasks]);

  const hourSummary = useMemo(() => {
    const estimated = tasks.reduce((sum, task) => sum + task.estimatedHours, 0);
    const logged = tasks.reduce((sum, task) => sum + task.loggedHours, 0);
    const remaining = Math.max(estimated - logged, 0);
    const completed = tasks.filter((task) => task.status === "Completed" || task.status === "Handover").length;

    return { estimated, logged, remaining, completed };
  }, [tasks]);

  const persist = (next: ProjectTask[]) => {
    setTasks(next);
    void taskRepository.write(next);
  };

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

  useEffect(() => {
    let active = true;

    const loadTasks = async () => {
      const initialTasks = await taskRepository.read();
      if (active) {
        setTasks(initialTasks);
      }
    };

    void loadTasks();

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

  const addTask = (values: {
    title: string;
    changePoints: string[];
    requestedDate: string;
    clientName: string;
    estimatedHours?: number;
    hourlyRate?: number;
  }) => {
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
            values.estimatedHours !== undefined
              ? `Request captured with estimate ${values.estimatedHours}h`
              : "Request captured (estimate pending)"
        }
      ],
      hourRevisions: []
    };
    persist([task, ...tasks]);
    openModal("Request Added", "New change request has been added successfully.", "success");
  };

  const updateStatus = (
    taskId: string,
    nextStatus: TaskStatus,
    note: string,
    statusDate?: string,
    estimatedHoursOnStatus?: number,
    deliveryDateOverride?: string
  ) => {
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
            : nextStatus === "Approved"
              ? task.deliveryDate
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

      persist(next);
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

    persist(next);
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
    const statusIndex = (status: TaskStatus) => STATUSES.indexOf(status);
    const target = tasks.find((task) => task.id === taskId);
    if (!target) return;
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

    persist(next);
    openModal("Request Updated", "Request details were updated successfully.", "success");
  };

  const requestDeleteTask = (taskId: string) => {
    const next = tasks.filter((task) => task.id !== taskId);
    persist(next);
    openModal("Deleted", "Request has been deleted.", "success");
  };

  const handleExport = () => {
    const blob = new Blob([exportTasks(tasks)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `project-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    try {
      const parsed = importTasks(text);
      persist(parsed);
      openModal("Import Complete", "JSON data imported successfully.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not import JSON";
      openModal("Import Failed", message, "error");
    }
  };

  return (
    <main className="page dashboard-shell">
      <aside className="dashboard-sidebar card">
        <div className="brand-panel">
          <p className="brand-title">PTA Console</p>
          <small>Retro Admin Mode</small>
        </div>
        <div className="stack">
          <div className="sidebar-metric">
            <small>Total Requests</small>
            <strong>{tasks.length}</strong>
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
          <button className="secondary" onClick={handleImportClick}>
            Import JSON
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
            <h1>Project Tracker Agent</h1>
            <p>Track project changes date-wise and move requests through your client approval workflow.</p>
          </div>
          <div className="status-lamp">
            <span className="lamp online" />
            <small>System Online</small>
          </div>
        </section>

        <section className="kpi-grid">
          <div className="card kpi">
            <small>Total Requests</small>
            <h2>{tasks.length}</h2>
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
                tasks={filtered}
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
