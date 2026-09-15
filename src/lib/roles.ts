// Pure role predicates — kept separate from auth.ts so they (and anything
// that only needs them) don't have to pull in the whole NextAuth/Prisma setup.
import type { UserRole } from "@prisma/client";

export function isAdmin(role: UserRole): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

export function isClientRole(role: UserRole): boolean {
  return ["OWNER", "MANAGER", "AGENT", "VIEWER", "CLIENT"].includes(role);
}
