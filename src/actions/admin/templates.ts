"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth, isAdmin } from "@/lib/auth";
import { generateWebhookSecret } from "@/lib/utils";
import type { Prisma } from "@prisma/client";

const templateSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(10),
  longDescription: z.string().optional(),
  industry: z.string().min(1),
  category: z.string().min(1),
  tags: z.array(z.string()).optional(),
  iconEmoji: z.string().optional(),
});

const versionSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "Usa formato semver: 1.0.0"),
  changelog: z.string().optional(),
  n8nWorkflowJson: z.record(z.unknown()),
  defaultConfig: z.record(z.unknown()).optional(),
});

export async function createTemplate(data: z.infer<typeof templateSchema>) {
  const session = await auth();
  if (!session || !isAdmin(session.user.role)) throw new Error("No autorizado");

  const parsed = templateSchema.parse(data);

  const template = await prisma.automationTemplate.create({
    data: {
      ...parsed,
      tags: parsed.tags ?? [],
      iconEmoji: parsed.iconEmoji ?? "⚡",
      createdBy: session.user.id,
    },
  });

  revalidatePath("/admin/templates");
  return { success: true, templateId: template.id };
}

export async function updateTemplate(
  templateId: string,
  data: Partial<z.infer<typeof templateSchema>>
) {
  const session = await auth();
  if (!session || !isAdmin(session.user.role)) throw new Error("No autorizado");

  const parsed = templateSchema.partial().parse(data);

  await prisma.automationTemplate.update({
    where: { id: templateId },
    data: { ...parsed, tags: parsed.tags ?? undefined },
  });

  revalidatePath("/admin/templates");
  revalidatePath(`/admin/templates/${templateId}`);
  return { success: true };
}

export async function publishTemplate(templateId: string, isPublished: boolean) {
  const session = await auth();
  if (!session || !isAdmin(session.user.role)) throw new Error("No autorizado");

  const template = await prisma.automationTemplate.findUnique({
    where: { id: templateId },
    include: { versions: { where: { isLatest: true } } },
  });
  if (!template) throw new Error("Template no encontrado");
  if (isPublished && template.versions.length === 0) {
    throw new Error("No puedes publicar un template sin versiones");
  }

  await prisma.automationTemplate.update({
    where: { id: templateId },
    data: { isPublished },
  });

  revalidatePath("/admin/templates");
  revalidatePath(`/admin/templates/${templateId}`);
  return { success: true };
}

export async function addTemplateVersion(
  templateId: string,
  data: z.infer<typeof versionSchema>
) {
  const session = await auth();
  if (!session || !isAdmin(session.user.role)) throw new Error("No autorizado");

  const parsed = versionSchema.parse(data);

  const template = await prisma.automationTemplate.findUnique({
    where: { id: templateId },
  });
  if (!template) throw new Error("Template no encontrado");

  // Check version doesn't exist
  const existing = await prisma.templateVersion.findUnique({
    where: { templateId_version: { templateId, version: parsed.version } },
  });
  if (existing) throw new Error(`La versión ${parsed.version} ya existe`);

  await prisma.$transaction([
    // Mark all existing versions as not latest
    prisma.templateVersion.updateMany({
      where: { templateId },
      data: { isLatest: false },
    }),
    // Create new version
    prisma.templateVersion.create({
      data: {
        templateId,
        version: parsed.version,
        changelog: parsed.changelog,
        n8nWorkflowJson: parsed.n8nWorkflowJson as Prisma.InputJsonValue,
        defaultConfig: parsed.defaultConfig
          ? (parsed.defaultConfig as Prisma.InputJsonValue)
          : undefined,
        isLatest: true,
      },
    }),
    // Update template's currentVersion
    prisma.automationTemplate.update({
      where: { id: templateId },
      data: { currentVersion: parsed.version },
    }),
  ]);

  revalidatePath(`/admin/templates/${templateId}`);
  return { success: true };
}

export async function installTemplateForClient(
  orgId: string,
  templateId: string,
  versionId: string,
  config?: Record<string, unknown>
) {
  const session = await auth();
  if (!session || !isAdmin(session.user.role)) throw new Error("No autorizado");

  const [org, version] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId } }),
    prisma.templateVersion.findUnique({
      where: { id: versionId },
      include: { template: true },
    }),
  ]);
  if (!org) throw new Error("Cliente no encontrado");
  if (!version) throw new Error("Versión no encontrada");

  const existing = await prisma.templateInstallation.findUnique({
    where: { organizationId_templateId: { organizationId: orgId, templateId } },
  });
  if (existing && existing.status === "ACTIVE") {
    throw new Error("Este template ya está instalado para este cliente");
  }

  // Create automation + installation atomically
  const automation = await prisma.automation.create({
    data: {
      organizationId: orgId,
      name: version.template.name,
      description: version.template.description,
      type: version.template.category,
      webhookSecret: generateWebhookSecret(),
      n8nWorkflowId: version.n8nWorkflowId,
      config: config ? (config as Prisma.InputJsonValue) : undefined,
    },
  });

  if (existing) {
    await prisma.templateInstallation.update({
      where: { id: existing.id },
      data: {
        versionId,
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
        versionId,
        automationId: automation.id,
        status: "ACTIVE",
        config: config ? (config as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  revalidatePath(`/admin/clients/${orgId}`);
  revalidatePath(`/admin/templates/${templateId}`);
  return { success: true, automationId: automation.id };
}
