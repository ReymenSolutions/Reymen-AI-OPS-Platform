"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { teamInviteEmail } from "@/lib/email-templates";
import { assertPlanCapacity } from "@/lib/plan-limits";
import type { UserRole } from "@prisma/client";

const inviteSchema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres"),
  email: z.string().email("Email inválido"),
  role: z.enum(["MANAGER", "AGENT", "VIEWER"]),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});

export async function inviteTeamMember(data: {
  name: string;
  email: string;
  role: string;
  password: string;
}) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  if (!can(session.user.role as UserRole, "team:manage")) throw new Error("Sin permisos para gestionar el equipo");

  const parsed = inviteSchema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.errors[0]?.message ?? "Datos inválidos");

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) throw new Error("Ya existe un usuario con ese email");

  await assertPlanCapacity(session.user.organizationId, "users");

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  const [user, org] = await Promise.all([
    prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash,
        role: parsed.data.role as UserRole,
        organizationId: session.user.organizationId,
      },
    }),
    prisma.organization.findUnique({ where: { id: session.user.organizationId }, select: { name: true } }),
  ]);

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "team.invite",
    resource: "User",
    resourceId: user.id,
    metadata: { email: user.email, role: user.role },
  });

  const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/login`;
  const email = teamInviteEmail(org?.name ?? "tu organización", loginUrl);
  sendEmail({ to: user.email, subject: email.subject, html: email.html, text: email.text }).catch(() => {});

  revalidatePath("/portal/settings");
  return { success: true };
}

export async function removeTeamMember(userId: string) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  if (!can(session.user.role as UserRole, "team:manage")) throw new Error("Sin permisos");

  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId: session.user.organizationId },
  });

  if (!user) throw new Error("Usuario no encontrado");
  if (user.id === session.user.id) throw new Error("No puedes eliminarte a ti mismo");
  if (user.role === "OWNER") throw new Error("No puedes eliminar al propietario");

  await prisma.user.update({
    where: { id: userId },
    data: { isActive: false },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "team.remove",
    resource: "User",
    resourceId: userId,
    metadata: { email: user.email },
  });

  revalidatePath("/portal/settings");
  return { success: true };
}

const updateSchema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres"),
  role: z.enum(["MANAGER", "AGENT", "VIEWER"]),
});

export async function updateTeamMember(userId: string, data: { name: string; role: string }) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  if (!can(session.user.role as UserRole, "team:manage")) throw new Error("Sin permisos para gestionar el equipo");

  const parsed = updateSchema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.errors[0]?.message ?? "Datos inválidos");

  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId: session.user.organizationId },
  });

  if (!user) throw new Error("Usuario no encontrado");
  if (user.id === session.user.id) throw new Error("No puedes editarte a ti mismo desde aquí");
  if (user.role === "OWNER") throw new Error("No puedes modificar al propietario");

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { name: parsed.data.name, role: parsed.data.role as UserRole },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "team.update",
    resource: "User",
    resourceId: userId,
    metadata: { email: updated.email, name: updated.name, role: updated.role },
  });

  revalidatePath("/portal/settings");
  return { success: true };
}
