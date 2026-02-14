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

  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;
  return rowToUser(data as DbUserRow);
}

async function upsertUserProfileFromAuth(input: {
  authUserId: string;
  email: string;
  name?: string;
  role: UserRole;
  status: AppUser["status"];
}) {
  if (!supabase) return;

  const nowIso = new Date().toISOString();
  const { error } = await supabase.from("app_users").upsert(
    {
      id: input.authUserId,
      name: (input.name || input.email.split("@")[0]).trim(),
      email: input.email,
      role: input.role,
      status: input.status,
      approved_by_user_id: null,
      approved_at: input.status === "approved" ? nowIso : null,
      rejection_reason: null,
      created_at: nowIso,
      updated_at: nowIso
    },
    { onConflict: "email" }
  );

  if (error) {
    throw new Error(error.message);
  }
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
  let sessionUser: AppUser | null = null;
  try {
    if (users) {
      sessionUser = users.find((user) => user.email.trim().toLowerCase() === sessionEmail) ?? null;
    } else {
      sessionUser = await readUserByEmail(sessionEmail);
    }
  } catch (readError) {
    console.warn("Session profile read failed. Keeping auth session:", readError);
    return null;
  }

  if (!sessionUser) {
    const roleFromMeta = sanitizeRole(data.user.user_metadata?.role);
    const status: AppUser["status"] =
      roleFromMeta === "super_user" && sessionEmail === "abdullahalnomancse@gmail.com" ? "approved" : "pending";

    try {
      await upsertUserProfileFromAuth({
        authUserId: data.user.id,
        email: sessionEmail,
        name: typeof data.user.user_metadata?.name === "string" ? data.user.user_metadata.name : undefined,
        role: roleFromMeta,
        status
      });
      sessionUser = await readUserByEmail(sessionEmail);
    } catch (upsertError) {
      console.warn("Session profile sync failed:", upsertError);
      return null;
    }
  }

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

  const { data, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, role: input.role }
    }
  });

  if (signUpError) {
    return { ok: false, message: `Auth registration failed: ${signUpError.message}` };
  }

  const authUser = data.user;
  const nowIso = new Date().toISOString();
  const status: AppUser["status"] =
    input.role === "super_user" && email === "abdullahalnomancse@gmail.com" ? "approved" : "pending";

  if (authUser?.id) {
    try {
      await upsertUserProfileFromAuth({
        authUserId: authUser.id,
        email,
        name,
        role: input.role,
        status
      });
    } catch (upsertError) {
      console.warn("Supabase register profile sync failed:", upsertError);
    }
  }

  const appUser: AppUser = {
    id: authUser?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    email,
    role: input.role,
    status,
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

  let appUser: AppUser | null = null;
  try {
    appUser = await readUserByEmail(data.user.email.toLowerCase());
  } catch (readError) {
    await supabase.auth.signOut();
    return { ok: false, message: `Profile read failed: ${String(readError)}` };
  }
  let resolvedUser = appUser;

  if (!resolvedUser) {
    const metaName = typeof data.user.user_metadata?.name === "string" ? data.user.user_metadata.name : "";
    const roleFromMeta = sanitizeRole(data.user.user_metadata?.role);
    const status: AppUser["status"] =
      roleFromMeta === "super_user" && data.user.email.toLowerCase() === "abdullahalnomancse@gmail.com"
        ? "approved"
        : "pending";

    try {
      await upsertUserProfileFromAuth({
        authUserId: data.user.id,
        email: data.user.email.toLowerCase(),
        name: metaName,
        role: roleFromMeta,
        status
      });
    } catch (insertError) {
      await supabase.auth.signOut();
      return { ok: false, message: `Profile creation failed: ${String(insertError)}` };
    }

    try {
      resolvedUser = await readUserByEmail(data.user.email.toLowerCase());
    } catch (readError) {
      await supabase.auth.signOut();
      return { ok: false, message: `Profile read failed: ${String(readError)}` };
    }
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
