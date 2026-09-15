"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateWebhookSecret } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import { assertPlanCapacity } from "@/lib/plan-limits";
import { assertModuleEnabled } from "@/lib/modules";
import type { Prisma } from "@prisma/client";

const installSchema = z.object({
  templateId: z.string(),
  config: z.record(z.unknown()).optional(),
});

export async function installTemplate(data: z.infer<typeof installSchema>) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");

  const { templateId, config } = installSchema.parse(data);
  const orgId = session.user.organizationId;

  // Installing a template always creates an Automation record (see below) —
  // it must not itself grant commercial access to a module the org hasn't
  // contracted, so it requires AUTOMATIONS to already be enabled rather than
  // enabling it implicitly.
  await assertModuleEnabled(orgId, "AUTOMATIONS");

  const template = await prisma.automationTemplate.findUnique({
    where: { id: templateId, isPublished: true },
    include: {
      versions: {
        where: { isLatest: true },
        take: 1,
      },
    },
  });

  if (!template) throw new Error("Template no encontrado");
  if (template.versions.length === 0) throw new Error("Template sin versiones disponibles");

  const latestVersion = template.versions[0];

  const existing = await prisma.templateInstallation.findUnique({
    where: { organizationId_templateId: { organizationId: orgId, templateId } },
  });

  if (existing?.status === "ACTIVE") {
    throw new Error("Este template ya está instalado");
  }

  await assertPlanCapacity(orgId, "automations");

  const automation = await prisma.automation.create({
    data: {
      organizationId: orgId,
      name: template.name,
      description: template.description,
      type: template.category,
      webhookSecret: generateWebhookSecret(),
      n8nWorkflowId: latestVersion.n8nWorkflowId,
      config: config ? (config as Prisma.InputJsonValue) : undefined,
    },
  });

  if (existing) {
    await prisma.templateInstallation.update({
      where: { id: existing.id },
      data: {
        versionId: latestVersion.id,
        automationId: automation.id,
        status: "ACTIVE",
        config: config ? (config as Prisma.InputJsonValue) : undefined,
        updatedAt: new Date(),
      },
    });
  } else {
    await prisma.templateInstallation.create({
      data: {
        organizationId: orgId,
        templateId,
        versionId: latestVersion.id,
        automationId: automation.id,
        status: "ACTIVE",
        config: config ? (config as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  await logAudit({
    organizationId: orgId,
    userId: session.user.id,
    action: "template.install",
    resource: "TemplateInstallation",
    resourceId: templateId,
    metadata: { templateName: template.name, version: latestVersion.version },
  });

  revalidatePath("/portal/templates");
  revalidatePath("/portal/automations");
  return { success: true, automationId: automation.id };
}

export async function uninstallTemplate(templateId: string) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");

  const orgId = session.user.organizationId;

  const installation = await prisma.templateInstallation.findUnique({
    where: { organizationId_templateId: { organizationId: orgId, templateId } },
  });

  if (!installation || installation.status !== "ACTIVE") {
    throw new Error("Template no está instalado");
  }

  await prisma.$transaction([
    prisma.templateInstallation.update({
      where: { id: installation.id },
      data: { status: "UNINSTALLED" },
    }),
    ...(installation.automationId
      ? [
          prisma.automation.update({
            where: { id: installation.automationId },
            data: { status: "ARCHIVED" },
          }),
        ]
      : []),
  ]);

  await logAudit({
    organizationId: orgId,
    userId: session.user.id,
    action: "template.uninstall",
    resource: "TemplateInstallation",
    resourceId: templateId,
  });

  revalidatePath("/portal/templates");
  revalidatePath("/portal/automations");
  return { success: true };
}
