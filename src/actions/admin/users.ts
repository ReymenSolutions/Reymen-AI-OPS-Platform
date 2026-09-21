"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth, isAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { UserRole } from "@prisma/client";

const ORG_USER_ROLES = ["OWNER", "MANAGER", "AGENT", "VIEWER"] as const;
const STANDALONE_USER_ROLES = ["SUPER_ADMIN", "ADMIN"] as const;

const createOrgUserSchema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres"),
  email: z.string().email("Email inválido"),
  role: z.enum(ORG_USER_ROLES),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});

export async function createOrgUser(orgId: string, data: { name: string; email: string; role: string; password: string }) {
  const session = await auth();
  if (!session || !isAdmin(session.user.role)) throw new Error("No autorizado");

  const parsed = createOrgUserSchema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.errors[0]?.message ?? "Datos inválidos");

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true } });
  if (!org) throw new Error("Cliente no encontrado");

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) throw new Error("Ya existe un usuario con ese email");

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: parsed.data.role as UserRole,
      organizationId: orgId,
    },
  });

  await logAudit({
    organizationId: orgId,
    userId: session.user.id,
    action: "admin.user.create",
    resource: "User",
    resourceId: user.id,
    metadata: { email: user.email, role: user.role },
  });

  revalidatePath(`/admin/clients/${orgId}`);
  return { success: true };
}

const updateOrgUserSchema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres"),
  role: z.enum(ORG_USER_ROLES),
});

export async function updateOrgUser(userId: string, data: { name: string; role: string }) {
  const session = await auth();
  if (!session || !isAdmin(session.user.role)) throw new Error("No autorizado");

  const parsed = updateOrgUserSchema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.errors[0]?.message ?? "Datos inválidos");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.organizationId) throw new Error("Usuario no encontrado");

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { name: parsed.data.name, role: parsed.data.role as UserRole },
  });

  await logAudit({
    organizationId: user.organizationId,
    userId: session.user.id,
    action: "admin.user.update",
    resource: "User",
    resourceId: userId,
    metadata: { name: updated.name, role: updated.role },
  });

  revalidatePath(`/admin/clients/${user.organizationId}`);
  return { success: true };
}

export async function setUserActive(userId: string, isActive: boolean) {
  const session = await auth();
  if (!session || !isAdmin(session.user.role)) throw new Error("No autorizado");
  if (userId === session.user.id) throw new Error("No puedes desactivarte a ti mismo");

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error("Usuario no encontrado");
  // Only a SUPER_ADMIN can deactivate another platform admin.
  if (target.role === "SUPER_ADMIN" && session.user.role !== "SUPER_ADMIN") {
    throw new Error("Sin permisos para modificar a un super administrador");
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { isActive },
  });

  await logAudit({
    organizationId: user.organizationId ?? undefined,
    userId: session.user.id,
    action: isActive ? "admin.user.activate" : "admin.user.deactivate",
    resource: "User",
    resourceId: userId,
    metadata: { email: user.email },
  });

  revalidatePath("/admin/users");
  if (user.organizationId) revalidatePath(`/admin/clients/${user.organizationId}`);
  return { success: true };
}

const createStandaloneUserSchema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres"),
  email: z.string().email("Email inválido"),
  role: z.enum(STANDALONE_USER_ROLES),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});

// Platform users with no organization — SUPER_ADMIN/ADMIN accounts only.
// Restricted to SUPER_ADMIN so a regular admin can't mint new admin accounts.
export async function createStandaloneUser(data: { name: string; email: string; role: string; password: string }) {
  const session = await auth();
  if (!session || session.user.role !== "SUPER_ADMIN") throw new Error("No autorizado");

  const parsed = createStandaloneUserSchema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.errors[0]?.message ?? "Datos inválidos");

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) throw new Error("Ya existe un usuario con ese email");

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: parsed.data.role as UserRole,
      organizationId: null,
    },
  });

  await logAudit({
    userId: session.user.id,
    action: "admin.user.create",
    resource: "User",
    resourceId: user.id,
    metadata: { email: user.email, role: user.role },
  });

  revalidatePath("/admin/users");
  return { success: true };
}

export async function getAllUsers() {
  const session = await auth();
  if (!session || !isAdmin(session.user.role)) throw new Error("No autorizado");

  return prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      organization: { select: { id: true, name: true } },
    },
  });
}
