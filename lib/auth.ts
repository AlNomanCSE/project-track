import { supabase } from "@/lib/supabase";
import { isSuperUser } from "@/lib/super-user";
import type { AppUser, UserRole } from "@/lib/types";

const SESSION_KEY = "pta-session-v1";

type DbUserRow = {
  id: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  status: AppUser["status"];
  created_at: string;
  approved_by_user_id: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
};

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function rowToUser(row: DbUserRow): AppUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    password: row.password,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    approvedByUserId: row.approved_by_user_id ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    rejectionReason: row.rejection_reason ?? undefined
  };
}

function userToRow(user: AppUser): DbUserRow {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    password: user.password,
    role: user.role,
    status: user.status,
    created_at: user.createdAt,
    approved_by_user_id: user.approvedByUserId ?? null,
    approved_at: user.approvedAt ?? null,
    rejection_reason: user.rejectionReason ?? null
  };
}

export function getSessionUserId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SESSION_KEY);
}

export function setSessionUserId(userId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_KEY, userId);
}

export function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
}

export async function readUsers(): Promise<AppUser[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("app_users")
    .select("id, name, email, password, role, status, created_at, approved_by_user_id, approved_at, rejection_reason")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Supabase users read failed:", error.message);
    return [];
  }

  return ((data ?? []) as DbUserRow[]).map(rowToUser);
}

export async function readSessionUser(users?: AppUser[]): Promise<AppUser | null> {
  const sessionUserId = getSessionUserId();
  if (!sessionUserId) return null;

  const list = users ?? (await readUsers());
  const sessionUser = list.find((user) => user.id === sessionUserId) ?? null;
  if (!sessionUser || sessionUser.status !== "approved") {
    clearSession();
    return null;
  }

  return sessionUser;
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}): Promise<{ ok: true; user: AppUser; message: string } | { ok: false; message: string }> {
  if (!supabase) {
    return { ok: false, message: "Supabase is not configured." };
  }

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password.trim();

  if (!name) return { ok: false, message: "Name is required." };
  if (!email) return { ok: false, message: "Email is required." };
  if (!password || password.length < 4) {
    return { ok: false, message: "Password must be at least 4 characters." };
  }

  const users = await readUsers();
  if (users.some((user) => user.email === email)) {
    return { ok: false, message: "This email is already registered." };
  }

  if (users.length === 0 && input.role !== "admin") {
    return { ok: false, message: "First account must be an admin account." };
  }

  const nowIso = new Date().toISOString();
  const isBootstrapAdmin = users.length === 0 && input.role === "admin";

  const user: AppUser = {
    id: createId(),
    name,
    email,
    password,
    role: input.role,
    status: isBootstrapAdmin ? "approved" : "pending",
    createdAt: nowIso,
    approvedAt: isBootstrapAdmin ? nowIso : undefined
  };

  const { error } = await supabase.from("app_users").insert(userToRow(user));
  if (error) {
    return { ok: false, message: `Registration failed: ${error.message}` };
  }

  if (isBootstrapAdmin) {
    setSessionUserId(user.id);
    return { ok: true, user, message: "Bootstrap admin created and logged in." };
  }

  return { ok: true, user, message: "Registration submitted. Wait for admin approval." };
}

export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<{ ok: true; user: AppUser } | { ok: false; message: string }> {
  if (!supabase) {
    return { ok: false, message: "Supabase is not configured." };
  }

  const email = input.email.trim().toLowerCase();
  const password = input.password.trim();

  if (!email || !password) {
    return { ok: false, message: "Email and password are required." };
  }

  const { data, error } = await supabase
    .from("app_users")
    .select("id, name, email, password, role, status, created_at, approved_by_user_id, approved_at, rejection_reason")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    return { ok: false, message: `Login failed: ${error.message}` };
  }

  if (!data) {
    return { ok: false, message: "Invalid email or password." };
  }

  const user = rowToUser(data as DbUserRow);

  if (user.password !== password) {
    return { ok: false, message: "Invalid email or password." };
  }

  if (user.status === "pending") {
    return { ok: false, message: "Account is pending admin approval." };
  }

  if (user.status === "rejected") {
    return { ok: false, message: "Account was rejected by admin." };
  }

  setSessionUserId(user.id);
  return { ok: true, user };
}

export function logoutUser() {
  clearSession();
}

export async function decideUserApproval(input: {
  actor: AppUser;
  userId: string;
  approve: boolean;
  reason?: string;
}): Promise<{ ok: true; users: AppUser[]; message: string } | { ok: false; message: string }> {
  if (!supabase) {
    return { ok: false, message: "Supabase is not configured." };
  }

  if (!isSuperUser(input.actor)) {
    return { ok: false, message: "Only super user can approve/reject users." };
  }

  if (input.actor.status !== "approved") {
    return { ok: false, message: "Super user account must be approved." };
  }

  const users = await readUsers();
  const target = users.find((user) => user.id === input.userId);
  if (!target) return { ok: false, message: "User not found." };
  if (target.status !== "pending") {
    return { ok: false, message: "Only pending user can be approved/rejected." };
  }

  const nextStatus: AppUser["status"] = input.approve ? "approved" : "rejected";
  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from("app_users")
    .update({
      status: nextStatus,
      approved_by_user_id: input.actor.id,
      approved_at: nowIso,
      rejection_reason: input.approve ? null : (input.reason || "Rejected by admin")
    })
    .eq("id", input.userId);

  if (error) {
    return { ok: false, message: `Update failed: ${error.message}` };
  }

  const refreshed = await readUsers();

  return {
    ok: true,
    users: refreshed,
    message: input.approve ? "User approved successfully." : "User rejected successfully."
  };
}

export async function deleteUserBySuper(input: {
  actor: AppUser;
  targetUserId: string;
}): Promise<{ ok: true; users: AppUser[]; message: string } | { ok: false; message: string }> {
  if (!supabase) {
    return { ok: false, message: "Supabase is not configured." };
  }

  if (!isSuperUser(input.actor)) {
    return { ok: false, message: "Only super user can delete users." };
  }

  if (input.actor.id === input.targetUserId) {
    return { ok: false, message: "Super user cannot delete own account." };
  }

  const { error: clearApproverRefError } = await supabase
    .from("app_users")
    .update({ approved_by_user_id: null })
    .eq("approved_by_user_id", input.targetUserId);

  if (clearApproverRefError) {
    return { ok: false, message: `Delete failed: ${clearApproverRefError.message}` };
  }

  const { error: clearOwnerRefError } = await supabase
    .from("task_access_meta")
    .update({ owner_user_id: null })
    .eq("owner_user_id", input.targetUserId);

  if (clearOwnerRefError) {
    return { ok: false, message: `Delete failed: ${clearOwnerRefError.message}` };
  }

  const { error: clearTaskDecisionRefError } = await supabase
    .from("task_access_meta")
    .update({ decided_by_user_id: null })
    .eq("decided_by_user_id", input.targetUserId);

  if (clearTaskDecisionRefError) {
    return { ok: false, message: `Delete failed: ${clearTaskDecisionRefError.message}` };
  }

  const { error } = await supabase
    .from("app_users")
    .delete()
    .eq("id", input.targetUserId);

  if (error) {
    return { ok: false, message: `Delete failed: ${error.message}` };
  }

  const refreshed = await readUsers();
  return { ok: true, users: refreshed, message: "User deleted successfully." };
}
