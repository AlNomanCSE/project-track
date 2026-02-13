import { supabase } from "@/lib/supabase";
import type { AppUser, ProjectTask, TaskAccessMeta } from "@/lib/types";

type DbTaskMetaRow = {
  task_id: string;
  owner_user_id: string | null;
  approval_status: TaskAccessMeta["approvalStatus"];
  decision_note: string | null;
  decided_by_user_id: string | null;
  decided_at: string | null;
  updated_at: string;
};

function rowToMeta(row: DbTaskMetaRow): TaskAccessMeta {
  return {
    taskId: row.task_id,
    ownerUserId: row.owner_user_id ?? undefined,
    approvalStatus: row.approval_status,
    decisionNote: row.decision_note ?? undefined,
    decidedByUserId: row.decided_by_user_id ?? undefined,
    decidedAt: row.decided_at ?? undefined,
    updatedAt: row.updated_at
  };
}

function metaToRow(meta: TaskAccessMeta): DbTaskMetaRow {
  return {
    task_id: meta.taskId,
    owner_user_id: meta.ownerUserId ?? null,
    approval_status: meta.approvalStatus,
    decision_note: meta.decisionNote ?? null,
    decided_by_user_id: meta.decidedByUserId ?? null,
    decided_at: meta.decidedAt ?? null,
    updated_at: meta.updatedAt
  };
}

export type TaskMetaById = Record<string, TaskAccessMeta>;

export async function readTaskMetaById(): Promise<TaskMetaById> {
  if (!supabase) return {};

  const { data, error } = await supabase
    .from("task_access_meta")
    .select("task_id, owner_user_id, approval_status, decision_note, decided_by_user_id, decided_at, updated_at");

  if (error) {
    console.warn("Supabase task meta read failed:", error.message);
    return {};
  }

  const map: TaskMetaById = {};
  for (const row of (data ?? []) as DbTaskMetaRow[]) {
    const meta = rowToMeta(row);
    map[meta.taskId] = meta;
  }
  return map;
}

export async function writeTaskMetaById(value: TaskMetaById): Promise<void> {
  if (!supabase) return;

  const rows = Object.values(value).map(metaToRow);
  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from("task_access_meta")
      .upsert(rows, { onConflict: "task_id" });

    if (upsertError) {
      console.warn("Supabase task meta upsert failed:", upsertError.message);
      return;
    }
  }

  const { data: existing, error: readError } = await supabase
    .from("task_access_meta")
    .select("task_id");

  if (readError) {
    console.warn("Supabase task meta cleanup read failed:", readError.message);
    return;
  }

  const keep = new Set(Object.keys(value));
  const toDelete = (existing ?? []).map((row) => row.task_id as string).filter((id) => !keep.has(id));

  if (toDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from("task_access_meta")
      .delete()
      .in("task_id", toDelete);

    if (deleteError) {
      console.warn("Supabase task meta cleanup delete failed:", deleteError.message);
    }
  }
}

export function ensureTaskMetaSync(tasks: ProjectTask[], currentUser: AppUser | null, current: TaskMetaById) {
  const nowIso = new Date().toISOString();
  let changed = false;
  const next: TaskMetaById = { ...current };
  const existingIds = new Set(tasks.map((task) => task.id));

  for (const task of tasks) {
    if (next[task.id]) continue;

    changed = true;
    next[task.id] = {
      taskId: task.id,
      ownerUserId: currentUser?.id,
      approvalStatus: currentUser?.role === "client" ? "pending" : "approved",
      updatedAt: nowIso
    };
  }

  for (const taskId of Object.keys(next)) {
    if (existingIds.has(taskId)) continue;
    changed = true;
    delete next[taskId];
  }

  return { changed, next };
}

export function getVisibleTasks(tasks: ProjectTask[], metaById: TaskMetaById, user: AppUser) {
  if (user.role === "admin") return tasks;
  return tasks.filter((task) => metaById[task.id]?.ownerUserId === user.id);
}

export function metaForNewTask(taskId: string, user: AppUser): TaskAccessMeta {
  const nowIso = new Date().toISOString();

  return {
    taskId,
    ownerUserId: user.id,
    approvalStatus: user.role === "admin" ? "approved" : "pending",
    updatedAt: nowIso
  };
}

export function decideTaskApproval(meta: TaskAccessMeta, actor: AppUser, approve: boolean, note?: string): TaskAccessMeta {
  const nowIso = new Date().toISOString();

  return {
    ...meta,
    approvalStatus: approve ? "approved" : "rejected",
    decisionNote: note?.trim() || (approve ? "Approved by admin" : "Rejected by admin"),
    decidedByUserId: actor.id,
    decidedAt: nowIso,
    updatedAt: nowIso
  };
}
