"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PopupModal from "@/components/PopupModal";
import { decideUserApproval, deleteUserBySuper, readSessionUser, readUsers } from "@/lib/auth";
import { formatShortDate } from "@/lib/date";
import { isSuperUser } from "@/lib/super-user";
import { taskRepository } from "@/lib/storage";
import { decideTaskApproval, readTaskMetaById, type TaskMetaById, writeTaskMetaById } from "@/lib/task-access";
import type { AppUser, ProjectTask } from "@/lib/types";

export default function SuperUsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [taskMetaById, setTaskMetaById] = useState<TaskMetaById>({});
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);

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

  useEffect(() => {
    let active = true;

    const load = async () => {
      const [nextUsers, nextTasks, nextMeta] = await Promise.all([readUsers(), taskRepository.read(), readTaskMetaById()]);
      const sessionUser = await readSessionUser(nextUsers);
      if (!active) return;

      setUsers(nextUsers);
      setTasks(nextTasks);
      setTaskMetaById(nextMeta);
      setCurrentUser(sessionUser);
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const pendingUsers = useMemo(() => users.filter((user) => user.status === "pending"), [users]);
  const adminUsers = useMemo(
    () => users.filter((user) => user.role === "admin" || user.role === "super_user"),
    [users]
  );
  const clientUsers = useMemo(() => users.filter((user) => user.role === "client"), [users]);
  const pendingTaskApprovals = useMemo(
    () => tasks.filter((task) => taskMetaById[task.id]?.approvalStatus === "pending"),
    [tasks, taskMetaById]
  );

  const isAllowed = isSuperUser(currentUser);

  const refreshAll = async () => {
    const [nextUsers, nextTasks, nextMeta] = await Promise.all([readUsers(), taskRepository.read(), readTaskMetaById()]);
    setUsers(nextUsers);
    setTasks(nextTasks);
    setTaskMetaById(nextMeta);
  };

  const handleUserDecision = async (userId: string, approve: boolean) => {
    if (!currentUser || !isAllowed) return;
    const result = await decideUserApproval({ actor: currentUser, userId, approve });
    if (!result.ok) {
      openModal("Action Failed", result.message, "error");
      return;
    }

    setUsers(result.users);
    openModal("Done", result.message, "success");
  };

  const handleDeleteUser = async (userId: string) => {
    if (!currentUser || !isAllowed) return;

    const result = await deleteUserBySuper({ actor: currentUser, targetUserId: userId });
    if (!result.ok) {
      openModal("Delete Failed", result.message, "error");
      return;
    }

    setUsers(result.users);
    await refreshAll();
    openModal("User Deleted", result.message, "success");
  };

  const handleTaskDecision = async (taskId: string, approve: boolean) => {
    if (!currentUser || !isAllowed) return;

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
        approve ? "Task approved by super user" : "Task rejected by super user"
      )
    };

    setTaskMetaById(nextMeta);
    await writeTaskMetaById(nextMeta);
    openModal("Task Decision Saved", approve ? "Task approved." : "Task rejected.", "success");
  };

  if (!currentUser) {
    return (
      <main className="page">
        <section className="card stack">
          <h1>Login Required</h1>
          <p className="muted">Please login first.</p>
          <div>
            <Link href="/" className="button-link">
              Back To Dashboard
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (!isAllowed) {
    return (
      <main className="page">
        <section className="card stack">
          <h1>Access Denied</h1>
          <p className="muted">Only super user can access this page.</p>
          <div>
            <Link href="/" className="button-link">
              Back To Dashboard
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page stack">
      <section className="card stack">
        <div className="row between gap">
          <div>
            <h1>Super User Control</h1>
            <p className="muted">Manage admin/user accounts and approve pending tasks.</p>
          </div>
          <Link href="/" className="button-link secondary-link">
            Back To Dashboard
          </Link>
        </div>
      </section>

      <section className="approval-grid">
        <div className="card stack">
          <h2>Pending User Approvals</h2>
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
          <h2>Pending Task Approvals</h2>
          {pendingTaskApprovals.length === 0 ? (
            <p className="muted">No pending tasks.</p>
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
                      <div className="muted">Requested: {formatShortDate(task.requestedDate)}</div>
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

      <section className="approval-grid">
        <div className="card stack">
          <h2>Admin / Super User List</h2>
          {adminUsers.length === 0 ? (
            <p className="muted">No admin users found.</p>
          ) : (
            <div className="stack">
              {adminUsers.map((user) => (
                <div key={user.id} className="approval-item">
                  <div>
                    <strong>{user.name}</strong>
                    <div className="muted">{user.email}</div>
                    <div className="muted">Role: {user.role}</div>
                    <div className="muted">Status: {user.status}</div>
                  </div>
                  {user.id !== currentUser.id ? (
                    <button type="button" className="danger" onClick={() => handleDeleteUser(user.id)}>
                      Delete User
                    </button>
                  ) : (
                    <small className="muted">Current Super User</small>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card stack">
          <h2>Client List</h2>
          {clientUsers.length === 0 ? (
            <p className="muted">No client users found.</p>
          ) : (
            <div className="stack">
              {clientUsers.map((user) => (
                <div key={user.id} className="approval-item">
                  <div>
                    <strong>{user.name}</strong>
                    <div className="muted">{user.email}</div>
                    <div className="muted">Role: {user.role}</div>
                    <div className="muted">Status: {user.status}</div>
                  </div>
                  <button type="button" className="danger" onClick={() => handleDeleteUser(user.id)}>
                    Delete User
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <PopupModal
        open={modalState.open}
        title={modalState.title}
        message={modalState.message}
        variant={modalState.variant}
        onClose={closeModal}
        onConfirm={modalState.onConfirm}
      />
    </main>
  );
}
