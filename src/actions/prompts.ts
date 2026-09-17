"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import type { PromptType } from "@prisma/client";

const promptSchema = z.object({
  name: z.string().min(1),
  content: z.string().min(10),
  type: z.enum(["SYSTEM", "GREETING", "LEAD_QUALIFICATION", "APPOINTMENT_BOOKING", "FAQ", "ESCALATION"]),
});

export async function createPrompt(data: z.infer<typeof promptSchema>) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");

  const parsed = promptSchema.parse(data);

  const prompt = await prisma.prompt.create({
    data: {
      ...parsed,
      organizationId: session.user.organizationId,
      isActive: false,
      versions: {
        create: { version: 1, content: parsed.content, isLatest: true, createdBy: session.user.id },
      },
    },
  });

  revalidatePath("/portal/prompts");
  return { success: true, promptId: prompt.id };
}

export async function updatePrompt(
  id: string,
  data: Partial<z.infer<typeof promptSchema>>
) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");

  const parsed = promptSchema.partial().parse(data);

  const prompt = await prisma.prompt.findFirst({
    where: { id, organizationId: session.user.organizationId },
    include: { versions: { where: { isLatest: true } } },
  });
  if (!prompt) throw new Error("Prompt no encontrado");

  const contentChanged = parsed.content !== undefined && parsed.content !== prompt.content;

  if (!contentChanged) {
    // Name-only edit: no new history entry needed, the content didn't move.
    await prisma.prompt.update({ where: { id }, data: parsed });
  } else {
    const latest = prompt.versions[0];
    const nextVersion = (latest?.version ?? 0) + 1;

    await prisma.$transaction([
      prisma.promptVersion.updateMany({
        where: { promptId: id },
        data: { isLatest: false },
      }),
      prisma.promptVersion.create({
        data: {
          promptId: id,
          version: nextVersion,
          content: parsed.content!,
          createdBy: session.user.id,
        },
      }),
      prisma.prompt.update({ where: { id }, data: parsed }),
    ]);
  }

  revalidatePath("/portal/prompts");
  revalidatePath("/portal/ai-lab");
  return { success: true };
}

export async function activatePrompt(id: string, type: PromptType) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");

  const prompt = await prisma.prompt.findFirst({
    where: { id, organizationId: session.user.organizationId, type },
  });
  if (!prompt) throw new Error("Prompt no encontrado");

  // Deactivate all prompts of this type for org, then activate target
  await prisma.$transaction([
    prisma.prompt.updateMany({
      where: { organizationId: session.user.organizationId, type },
      data: { isActive: false },
    }),
    prisma.prompt.update({
      where: { id },
      data: { isActive: true },
    }),
  ]);

  revalidatePath("/portal/prompts");
  return { success: true };
}

export async function deletePrompt(id: string) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");

  const prompt = await prisma.prompt.findFirst({
    where: { id, organizationId: session.user.organizationId },
  });
  if (!prompt) throw new Error("Prompt no encontrado");

  await prisma.prompt.delete({ where: { id } });

  revalidatePath("/portal/prompts");
  return { success: true };
}

export async function listPromptVersions(promptId: string) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");

  const prompt = await prisma.prompt.findFirst({
    where: { id: promptId, organizationId: session.user.organizationId },
  });
  if (!prompt) throw new Error("Prompt no encontrado");

  return prisma.promptVersion.findMany({
    where: { promptId },
    orderBy: { version: "desc" },
  });
}

// Rollback never deletes or mutates history — it appends a brand-new
// version whose content matches an older one, exactly like reverting a
// commit. The prompt's live content then points at that new version.
export async function rollbackPromptVersion(promptId: string, targetVersionId: string) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");

  const prompt = await prisma.prompt.findFirst({
    where: { id: promptId, organizationId: session.user.organizationId },
    include: { versions: { where: { isLatest: true } } },
  });
  if (!prompt) throw new Error("Prompt no encontrado");

  const target = await prisma.promptVersion.findFirst({
    where: { id: targetVersionId, promptId },
  });
  if (!target) throw new Error("Versión no encontrada");

  const latest = prompt.versions[0];
  const nextVersion = (latest?.version ?? 0) + 1;

  await prisma.$transaction([
    prisma.promptVersion.updateMany({
      where: { promptId },
      data: { isLatest: false },
    }),
    prisma.promptVersion.create({
      data: {
        promptId,
        version: nextVersion,
        content: target.content,
        changelog: `Rollback a la versión ${target.version}`,
        createdBy: session.user.id,
      },
    }),
    prisma.prompt.update({ where: { id: promptId }, data: { content: target.content } }),
  ]);

  revalidatePath("/portal/prompts");
  revalidatePath("/portal/ai-lab");
  return { success: true };
}
