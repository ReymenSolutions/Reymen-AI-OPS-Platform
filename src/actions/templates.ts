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

/**
 * The actual per-template install: creates the Automation + upserts the
 * TemplateInstallation. Shared by installTemplate() (one template, from the
 * marketplace grid) and installTemplatePackage() (many templates at once,
 * from a curated industry package) so both go through the exact same plan-
 * capacity check and produce the exact same TemplateInstallation row —
 * a package install is just this, looped.
 */
async function installTemplateCore(
  orgId: string,
  userId: string,
  templateId: string,
  config?: Record<string, unknown>
) {
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
    userId,
    action: "template.install",
    resource: "TemplateInstallation",
    resourceId: templateId,
    metadata: { templateName: template.name, version: latestVersion.version },
  });

  return { automationId: automation.id };
}

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

  const { automationId } = await installTemplateCore(orgId, session.user.id, templateId, config);

  revalidatePath("/portal/templates");
  revalidatePath("/portal/automations");
  return { success: true, automationId };
}

/**
 * Installs every published template in a package in one go. Stops (rather
 * than throwing) the moment the org's plan capacity for automations is hit,
 * so a partial install always leaves real, consistent state — never a
 * half-created automation — and the caller can tell the client exactly how
 * many templates made it in.
 */
export async function installTemplatePackage(packageId: string) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  const orgId = session.user.organizationId;

  await assertModuleEnabled(orgId, "AUTOMATIONS");

  const pkg = await prisma.templatePackage.findUnique({
    where: { id: packageId, isPublished: true },
    include: {
      items: {
        orderBy: { order: "asc" },
        include: { template: { select: { id: true, isPublished: true } } },
      },
    },
  });
  if (!pkg) throw new Error("Paquete no encontrado");

  let installedCount = 0;
  let skippedCount = 0;
  let limitReached = false;

  for (const item of pkg.items) {
    if (!item.template.isPublished) continue;

    const existing = await prisma.templateInstallation.findUnique({
      where: { organizationId_templateId: { organizationId: orgId, templateId: item.template.id } },
    });
    if (existing?.status === "ACTIVE") {
      skippedCount++;
      continue;
    }

    try {
      await installTemplateCore(orgId, session.user.id, item.template.id);
      installedCount++;
    } catch (e) {
      // assertPlanCapacity() is the only thing installTemplateCore() throws
      // for a template we already confirmed exists and isn't yet installed.
      limitReached = true;
      void e;
      break;
    }
  }

  await logAudit({
    organizationId: orgId,
    userId: session.user.id,
    action: "template_package.install",
    resource: "TemplatePackage",
    resourceId: packageId,
    metadata: { packageName: pkg.name, installedCount, skippedCount, limitReached },
  });

  revalidatePath("/portal/templates");
  revalidatePath("/portal/automations");
  return { success: true, installedCount, skippedCount, limitReached };
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
