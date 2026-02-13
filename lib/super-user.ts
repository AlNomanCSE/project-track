import type { AppUser } from "@/lib/types";

export function isSuperUser(user: Pick<AppUser, "email" | "role"> | null | undefined): boolean {
  if (!user) return false;
  return user.role === "super_user";
}
