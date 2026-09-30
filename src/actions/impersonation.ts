"use server";

import { auth, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import {
  IMPERSONATION_COOKIE, IMPERSONATION_MAX_AGE, encodeImpersonationCookie, decodeImpersonationCookie,
} from "@/lib/impersonation-cookie";
import type { UserRole } from "@prisma/client";
import { UserError } from "@/lib/user-error";

export type PortalUser = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
  organizationId: string;
  organizationName: string;
};

export async function getPortalUsers(): Promise<PortalUser[]> {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) throw new UserError("Unauthorized");

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      organizationId: { not: null },
      role: { notIn: ["SUPER_ADMIN", "ADMIN"] },
    },
    include: { organization: { select: { name: true } } },
    orderBy: [{ organization: { name: "asc" } }, { name: "asc" }],
  });

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    image: u.image,
    role: u.role,
    organizationId: u.organizationId!,
    organizationName: u.organization?.name ?? "—",
  }));
}

export async function startImpersonation(targetUserId: string): Promise<void> {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) throw new UserError("Unauthorized");
  if (session.user.impersonating) throw new UserError("Already impersonating");

  const target = await prisma.user.findUnique({
    where: { id: targetUserId, isActive: true },
    include: { organization: { select: { name: true } } },
  });

  if (!target || !target.organizationId) throw new UserError("User not found or not a portal user");
  if (isAdmin(target.role as UserRole)) throw new UserError("Cannot impersonate admin users");

  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATION_COOKIE, await encodeImpersonationCookie({
    adminId: session.user.id,
    adminName: session.user.name ?? null,
    adminEmail: session.user.email ?? "",
    targetUserId: target.id,
    targetName: target.name ?? null,
    targetEmail: target.email,
    targetImage: target.image ?? null,
    targetRole: target.role,
    targetOrgId: target.organizationId,
  }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: IMPERSONATION_MAX_AGE,
    sameSite: "lax",
  });
}

export async function stopImpersonation(): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new UserError("Not authenticated");
  const cookieStore = await cookies();
  cookieStore.delete(IMPERSONATION_COOKIE);
}

export async function refreshImpersonationImage(newImage: string | null): Promise<void> {
  // Solo el admin que está impersonando puede renovar su propia cookie.
  const session = await auth();
  if (!session?.user.impersonating) return;
  const cookieStore = await cookies();
  const imp = await decodeImpersonationCookie(cookieStore.get(IMPERSONATION_COOKIE)?.value);
  if (!imp || imp.adminId !== session.user.impersonating.adminId) return;
  imp.targetImage = newImage;
  cookieStore.set(IMPERSONATION_COOKIE, await encodeImpersonationCookie(imp), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: IMPERSONATION_MAX_AGE,
    sameSite: "lax",
  });
}
