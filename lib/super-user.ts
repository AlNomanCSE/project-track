import type { AppUser } from "@/lib/types";

export const SUPER_USER_EMAIL = "abdullahalnomancse@gmail.com";

export function isSuperUser(user: Pick<AppUser, "email" | "role"> | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "super_user") return true;
  return (user.email || "").trim().toLowerCase() === SUPER_USER_EMAIL;
}
