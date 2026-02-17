import { supabase } from "@/lib/supabase";
import type { TodoInput, TodoItem, TodoStatus } from "@/lib/types";

const STORAGE_KEY = "project-tracker-todos-v1";
const SUPABASE_TODO_TABLE = "todo_items";

type DbTodoRow = {
  id: string;
  title: string;
  details: string | null;
  due_date: string;
  status: TodoStatus;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
};

type CreateTodoPayload = TodoInput & {
  id: string;
  createdByUserId: string;
};

function safeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeStatus(value: unknown): TodoStatus {
  return value === "done" ? "done" : "not_done";
}

function rowToTodo(row: DbTodoRow): TodoItem {
  return {
    id: row.id,
    title: row.title,
    details: row.details ?? undefined,
    dueDate: row.due_date,
    status: normalizeStatus(row.status),
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function todoToRow(item: TodoItem): DbTodoRow {
  return {
    id: item.id,
    title: item.title,
    details: item.details ?? null,
    due_date: item.dueDate,
    status: item.status,
    created_by_user_id: item.createdByUserId,
    created_at: item.createdAt,
    updated_at: item.updatedAt
  };
}

class TodoRepository {
  async read(): Promise<TodoItem[]> {
    const local = this.readFromLocal();
    if (!supabase) return local;

    const { data, error } = await supabase
      .from(SUPABASE_TODO_TABLE)
      .select("id, title, details, due_date, status, created_by_user_id, created_at, updated_at")
      .order("due_date", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Supabase todo read failed, using local data:", error.message);
      return local;
    }

    const remote = ((data ?? []) as DbTodoRow[]).map(rowToTodo);
    this.writeToLocal(remote);
    return remote;
  }

  async create(payload: CreateTodoPayload): Promise<TodoItem> {
    const nowIso = new Date().toISOString();
    const item: TodoItem = {
      id: payload.id,
      title: payload.title.trim(),
      details: payload.details?.trim() || undefined,
      dueDate: payload.dueDate,
      status: payload.status ?? "not_done",
      createdByUserId: payload.createdByUserId,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    if (supabase) {
      const { error } = await supabase.from(SUPABASE_TODO_TABLE).insert(todoToRow(item));
      if (error) {
        throw new Error(`Todo create failed: ${error.message}`);
      }
    }

    const local = this.readFromLocal();
    const next = [item, ...local].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    this.writeToLocal(next);
    return item;
  }

  async update(itemId: string, input: TodoInput): Promise<TodoItem | null> {
    const local = this.readFromLocal();
    const current = local.find((item) => item.id === itemId);
    if (!current) {
      const remote = await this.read();
      const remoteCurrent = remote.find((item) => item.id === itemId);
      if (!remoteCurrent) return null;
      return this.updateFromCurrent(remoteCurrent, input);
    }
    return this.updateFromCurrent(current, input);
  }

  private async updateFromCurrent(current: TodoItem, input: TodoInput): Promise<TodoItem> {
    const next: TodoItem = {
      ...current,
      title: input.title.trim(),
      details: input.details?.trim() || undefined,
      dueDate: input.dueDate,
      status: input.status ?? current.status,
      updatedAt: new Date().toISOString()
    };

    if (supabase) {
      const { error } = await supabase.from(SUPABASE_TODO_TABLE).update(todoToRow(next)).eq("id", next.id);
      if (error) {
        throw new Error(`Todo update failed: ${error.message}`);
      }
    }

    const local = this.readFromLocal();
    const mapped = local.map((item) => (item.id === next.id ? next : item));
    this.writeToLocal(mapped.sort((a, b) => a.dueDate.localeCompare(b.dueDate)));
    return next;
  }

  async updateStatus(itemId: string, status: TodoStatus): Promise<TodoItem | null> {
    const local = this.readFromLocal();
    let current = local.find((item) => item.id === itemId);
    if (!current) {
      const remote = await this.read();
      current = remote.find((item) => item.id === itemId);
      if (!current) return null;
    }
    return this.update(itemId, {
      title: current.title,
      details: current.details,
      dueDate: current.dueDate,
      status
    });
  }

  async remove(itemId: string): Promise<void> {
    if (supabase) {
      const { error } = await supabase.from(SUPABASE_TODO_TABLE).delete().eq("id", itemId);
      if (error) {
        throw new Error(`Todo delete failed: ${error.message}`);
      }
    }

    const local = this.readFromLocal();
    this.writeToLocal(local.filter((item) => item.id !== itemId));
  }

  private readFromLocal(): TodoItem[] {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const mapped = parsed
        .map((item): TodoItem | null => {
          if (typeof item !== "object" || item === null) return null;
          const record = item as Record<string, unknown>;
          const id = safeString(record.id);
          const title = safeString(record.title).trim();
          const dueDate = safeString(record.dueDate);
          const createdByUserId = safeString(record.createdByUserId);
          if (!id || !title || !dueDate || !createdByUserId) return null;

          return {
            id,
            title,
            details: safeString(record.details).trim() || undefined,
            dueDate,
            status: normalizeStatus(record.status),
            createdByUserId,
            createdAt: safeString(record.createdAt, new Date().toISOString()),
            updatedAt: safeString(record.updatedAt, new Date().toISOString())
          };
        })
        .filter((item): item is TodoItem => item !== null);
      return mapped.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    } catch {
      return [];
    }
  }

  private writeToLocal(items: TodoItem[]) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }
}

export const todoRepository = new TodoRepository();
