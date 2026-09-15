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

  await prisma.prompt.create({
    data: {
      ...parsed,
      organizationId: session.user.organizationId,
      isActive: false,
    },
  });

  revalidatePath("/portal/prompts");
  return { success: true };
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
  });
  if (!prompt) throw new Error("Prompt no encontrado");

  await prisma.prompt.update({ where: { id }, data: parsed });

  revalidatePath("/portal/prompts");
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
