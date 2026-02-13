import { supabase } from "@/lib/supabase";
import { isSuperUser } from "@/lib/super-user";
import type { AppUser, UserRole } from "@/lib/types";

type DbUserRow = {
  id: string;
  name: string;
  email: string;
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
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    approvedByUserId: row.approved_by_user_id ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    rejectionReason: row.rejection_reason ?? undefined
  };
}

function sanitizeRole(value: unknown): UserRole {
  return value === "super_user" || value === "admin" || value === "client" ? value : "client";
}

async function readUserByEmail(email: string): Promise<AppUser | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("app_users")
    .select("id, name, email, role, status, created_at, approved_by_user_id, approved_at, rejection_reason")
    .eq("email", email)
    .maybeSingle();

  if (error || !data) return null;
  return rowToUser(data as DbUserRow);
}

export async function readUsers(): Promise<AppUser[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("app_users")
    .select("id, name, email, role, status, created_at, approved_by_user_id, approved_at, rejection_reason")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Supabase users read failed:", error.message);
    return [];
  }

  return ((data ?? []) as DbUserRow[]).map(rowToUser);
}

export async function readSessionUser(users?: AppUser[]): Promise<AppUser | null> {
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) return null;

  const sessionEmail = data.user.email.trim().toLowerCase();
  const list = users ?? (await readUsers());
  const sessionUser = list.find((user) => user.email.trim().toLowerCase() === sessionEmail) ?? null;

  if (!sessionUser || sessionUser.status !== "approved") {
    await supabase.auth.signOut();
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
  if (!password || password.length < 6) {
    return { ok: false, message: "Password must be at least 6 characters." };
  }

  const { error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, role: input.role }
    }
  });

  if (signUpError) {
    return { ok: false, message: `Auth registration failed: ${signUpError.message}` };
  }

  const nowIso = new Date().toISOString();
  const appUser: AppUser = {
    id: createId(),
    name,
    email,
    role: input.role,
    status: "pending",
    createdAt: nowIso
  };

  return {
    ok: true,
    user: appUser,
    message: "Registration submitted. Please confirm email, then login for approval."
  };
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

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { ok: false, message: `Auth login failed: ${error.message}` };
  }

  if (!data.user?.email) {
    return { ok: false, message: "Auth login failed: user email missing in session response." };
  }

  const appUser = await readUserByEmail(data.user.email.toLowerCase());
  let resolvedUser = appUser;

  if (!resolvedUser) {
    const nowIso = new Date().toISOString();
    const metaName = typeof data.user.user_metadata?.name === "string" ? data.user.user_metadata.name : "";
    const roleFromMeta = sanitizeRole(data.user.user_metadata?.role);
    const status: AppUser["status"] =
      roleFromMeta === "super_user" && data.user.email.toLowerCase() === "abdullahalnomancse@gmail.com"
        ? "approved"
        : "pending";

    const insertPayload = {
      id: createId(),
      name: metaName.trim() || data.user.email.split("@")[0],
      email: data.user.email.toLowerCase(),
      role: roleFromMeta,
      status,
      approved_by_user_id: null,
      approved_at: status === "approved" ? nowIso : null,
      rejection_reason: null,
      created_at: nowIso,
      updated_at: nowIso
    };

    const { error: insertError } = await supabase.from("app_users").insert(insertPayload);
    if (insertError) {
      await supabase.auth.signOut();
      return { ok: false, message: `Profile creation failed: ${insertError.message}` };
    }

    resolvedUser = await readUserByEmail(data.user.email.toLowerCase());
    if (!resolvedUser) {
      await supabase.auth.signOut();
      return { ok: false, message: "User profile not found after creation." };
    }
  }

  if (resolvedUser.status === "pending") {
    await supabase.auth.signOut();
    return { ok: false, message: "Account is pending super user approval." };
  }

  if (resolvedUser.status === "rejected") {
    await supabase.auth.signOut();
    return { ok: false, message: "Account was rejected by super user." };
  }

  return { ok: true, user: resolvedUser };
}

export function logoutUser() {
  if (!supabase) return;
  void supabase.auth.signOut();
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
      rejection_reason: input.approve ? null : (input.reason || "Rejected by super user")
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
