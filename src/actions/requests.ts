"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth, isAdmin } from "@/lib/auth";
import { notifyAdmins } from "@/lib/admin-notifications";
import { newClientRequestEmail } from "@/lib/email-templates";
import type { RequestStatus } from "@prisma/client";

const createRequestSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(10),
  type: z.enum(["support", "new_automation", "change", "question"]),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
});

export async function createRequest(formData: FormData) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");

  const parsed = createRequestSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    type: formData.get("type"),
    priority: formData.get("priority") || "medium",
  });

  if (!parsed.success) throw new Error("Datos inválidos");

  const [, org] = await Promise.all([
    prisma.request.create({
      data: {
        ...parsed.data,
        organizationId: session.user.organizationId,
      },
    }),
    prisma.organization.findUnique({ where: { id: session.user.organizationId }, select: { name: true } }),
  ]);

  const adminUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/admin/requests`;
  const email = newClientRequestEmail(org?.name ?? "un cliente", parsed.data.title, adminUrl);
  await notifyAdmins(email);

  revalidatePath("/portal/requests");
  return { success: true };
}

export async function updateRequestStatus(requestId: string, status: RequestStatus) {
  const session = await auth();
  if (!session) throw new Error("No autorizado");

  if (isAdmin(session.user.role)) {
    await prisma.request.update({
      where: { id: requestId },
      data: {
        status,
        resolvedAt: status === "RESOLVED" || status === "CLOSED" ? new Date() : null,
      },
    });
  } else {
    const req = await prisma.request.findFirst({
      where: { id: requestId, organizationId: session.user.organizationId! },
    });
    if (!req) throw new Error("Solicitud no encontrada");

    await prisma.request.update({
      where: { id: requestId },
      data: { status },
    });
  }

  revalidatePath("/portal/requests");
  revalidatePath("/admin/requests");
  return { success: true };
}
