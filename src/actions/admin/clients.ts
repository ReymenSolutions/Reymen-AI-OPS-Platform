"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth, isAdmin } from "@/lib/auth";
import { generateSlug, generateWebhookSecret } from "@/lib/utils";
import { logAudit } from "@/lib/audit";

const createClientSchema = z.object({
  orgName: z.string().min(2),
  orgIndustry: z.string().optional(),
  userName: z.string().min(2),
  userEmail: z.string().email(),
  password: z.string().min(8),
});

export async function createClient(formData: FormData) {
  const session = await auth();
  if (!session || !isAdmin(session.user.role)) throw new Error("No autorizado");

  const parsed = createClientSchema.safeParse({
    orgName: formData.get("orgName"),
    orgIndustry: formData.get("orgIndustry") || undefined,
    userName: formData.get("userName"),
    userEmail: formData.get("userEmail"),
    password: formData.get("password"),
  });

  if (!parsed.success) throw new Error("Datos inválidos");

  const { orgName, orgIndustry, userName, userEmail, password } = parsed.data;
  const slug = generateSlug(orgName);
  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await prisma.organization.findUnique({ where: { slug } });
  const finalSlug = existing ? `${slug}-${Date.now()}` : slug;

  const org = await prisma.organization.create({
    data: {
      name: orgName,
      slug: finalSlug,
      industry: orgIndustry,
      n8nWebhookSecret: generateWebhookSecret(),
      users: {
        create: {
          name: userName,
          email: userEmail,
          passwordHash,
          role: "OWNER",
        },
      },
      // Same default pipeline every pre-existing org received via the
      // add_crm_pipeline migration backfill — keeps new orgs consistent
      // with it instead of starting with an empty, unusable pipeline.
      pipelineStages: {
        create: [
          { name: "Nuevo", order: 0 },
          { name: "Contactado", order: 1 },
          { name: "Calificado", order: 2 },
          { name: "Propuesta", order: 3 },
          { name: "Ganado", order: 4, isWon: true },
          { name: "Perdido", order: 5, isLost: true },
        ],
      },
    },
    include: { users: true },
  });

  await logAudit({
    userId: session.user.id,
    action: "client.create",
    resource: "Organization",
    resourceId: org.id,
    metadata: { name: org.name, slug: org.slug },
  });

  revalidatePath("/admin/clients");
  return { success: true, orgId: org.id };
}

export async function changePlan(orgId: string, plan: string) {
  const session = await auth();
  if (!session || !isAdmin(session.user.role)) throw new Error("No autorizado");

  const validPlans = ["starter", "professional", "enterprise"];
  if (!validPlans.includes(plan)) throw new Error("Plan inválido");

  const org = await prisma.organization.update({
    where: { id: orgId },
    data: { plan },
  });

  await logAudit({
    userId: session.user.id,
    organizationId: orgId,
    action: "client.plan_change",
    resource: "Organization",
    resourceId: orgId,
    metadata: { newPlan: plan },
  });

  revalidatePath(`/admin/clients/${orgId}`);
  return { success: true, plan: org.plan };
}

export async function updateClientStatus(orgId: string, isActive: boolean) {
  const session = await auth();
  if (!session || !isAdmin(session.user.role)) throw new Error("No autorizado");

  await prisma.organization.update({
    where: { id: orgId },
    data: { isActive },
  });

  await logAudit({
    userId: session.user.id,
    organizationId: orgId,
    action: "client.status_change",
    resource: "Organization",
    resourceId: orgId,
    metadata: { isActive },
  });

  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${orgId}`);
  return { success: true };
}

export async function rotateOrgWebhookSecret(orgId: string) {
  const session = await auth();
  if (!session || !isAdmin(session.user.role)) throw new Error("No autorizado");

  const newSecret = generateWebhookSecret();
  await prisma.organization.update({ where: { id: orgId }, data: { n8nWebhookSecret: newSecret } });

  await logAudit({
    userId: session.user.id,
    organizationId: orgId,
    action: "client.webhook_secret_rotate",
    resource: "Organization",
    resourceId: orgId,
  });

  revalidatePath(`/admin/clients/${orgId}`);
  return { success: true, secret: newSecret };
}

export async function assignAutomation(
  orgId: string,
  data: { name: string; type: string; description?: string; n8nWorkflowId?: string }
) {
  const session = await auth();
  if (!session || !isAdmin(session.user.role)) throw new Error("No autorizado");

  const automation = await prisma.automation.create({
    data: {
      organizationId: orgId,
      name: data.name,
      type: data.type,
      description: data.description,
      n8nWorkflowId: data.n8nWorkflowId,
      webhookSecret: generateWebhookSecret(),
    },
  });

  revalidatePath(`/admin/clients/${orgId}`);
  revalidatePath("/admin/automations");
  return { success: true, automationId: automation.id };
}
