"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth, isAdmin } from "@/lib/auth";
import { applyTemplateInstall } from "@/lib/template-install";
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

/**
 * Admin equivalent of installTemplate() (src/actions/templates.ts), for
 * installing a template on a client's behalf. Two real differences from
 * the client self-service path: an admin can pin any version, not just
 * the latest, and this isn't subject to the org's own plan capacity (a
 * deliberate admin override, not an oversight). Both still funnel into
 * the same applyTemplateInstall() for the actual Automation/
 * TemplateInstallation/audit-log work.
 */
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

  const { automationId } = await applyTemplateInstall({
    orgId,
    userId: session.user.id,
    templateId,
    template: {
      name: version.template.name,
      description: version.template.description,
      category: version.template.category,
    },
    version: { id: version.id, version: version.version, n8nWorkflowId: version.n8nWorkflowId },
    config,
  });

  revalidatePath(`/admin/clients/${orgId}`);
  revalidatePath(`/admin/templates/${templateId}`);
  return { success: true, automationId };
}
