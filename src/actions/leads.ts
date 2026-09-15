"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { assertPlanCapacity } from "@/lib/plan-limits";
import type { LeadStatus } from "@prisma/client";

const createLeadSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
});

export async function createLead(formData: FormData) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");

  const parsed = createLeadSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
    source: formData.get("source") || "manual",
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) throw new Error("Datos inválidos");

  await assertPlanCapacity(session.user.organizationId, "leads");

  const lead = await prisma.lead.create({
    data: {
      ...parsed.data,
      email: parsed.data.email || null,
      organizationId: session.user.organizationId,
    },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "lead.create",
    resource: "Lead",
    resourceId: lead.id,
    metadata: { name: lead.name, source: lead.source },
  });

  revalidatePath("/portal/leads");
  return { success: true, leadId: lead.id };
}

export async function updateLeadStatus(leadId: string, status: LeadStatus) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId: session.user.organizationId },
  });

  if (!lead) throw new Error("Lead no encontrado");

  await prisma.lead.update({
    where: { id: leadId },
    data: { status },
  });

  revalidatePath("/portal/leads");
  return { success: true };
}

export async function deleteLead(leadId: string) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId: session.user.organizationId },
  });

  if (!lead) throw new Error("Lead no encontrado");

  // Soft delete
  await prisma.lead.update({
    where: { id: leadId },
    data: { deletedAt: new Date() },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "lead.delete",
    resource: "Lead",
    resourceId: leadId,
  });

  revalidatePath("/portal/leads");
  return { success: true };
}
